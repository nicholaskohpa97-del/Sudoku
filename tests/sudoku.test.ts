import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeStandings, createLeague } from "@/lib/server/leagues";
import { applyMove, createRoom, endRoom, finalizeIfDone, joinRoom, leaveRoom, roomView, startRoom } from "@/lib/server/rooms";
import type { Db, PlayerRecord, RoomRecord } from "@/lib/server/store";
import {
  countClues,
  countSolutions,
  DIFFICULTIES,
  DIFFICULTY_CONFIG,
  generatePuzzle,
  MAX_MISTAKES,
  solvableWithSingles,
} from "@/lib/sudoku/engine";
import { monthKey, scoreMatch, shiftMonth } from "@/lib/sudoku/tournament";

function validSolution(grid: string): boolean {
  const units: number[][] = [];
  for (let k = 0; k < 9; k++) {
    units.push(Array.from({ length: 9 }, (_, j) => k * 9 + j));
    units.push(Array.from({ length: 9 }, (_, j) => j * 9 + k));
    units.push(Array.from({ length: 9 }, (_, j) => (Math.floor(k / 3) * 3 + Math.floor(j / 3)) * 9 + (k % 3) * 3 + (j % 3)));
  }
  return units.every((u) => new Set(u.map((i) => grid[i])).size === 9 && !u.some((i) => grid[i] === "0"));
}

describe("engine", () => {
  for (const difficulty of DIFFICULTIES) {
    it(`generates unique, consistent ${difficulty} puzzles`, () => {
      for (let seed = 1; seed <= 5; seed++) {
        const p = generatePuzzle(difficulty, seed * 104729);
        assert.ok(validSolution(p.solution));
        assert.equal(countSolutions(p.puzzle), 1);
        for (let i = 0; i < 81; i++) if (p.puzzle[i] !== "0") assert.equal(p.puzzle[i], p.solution[i]);
        assert.ok(countClues(p.puzzle) <= DIFFICULTY_CONFIG[difficulty].clues + 4);
        if (DIFFICULTY_CONFIG[difficulty].singlesOnly) assert.ok(solvableWithSingles(p.puzzle));
      }
    });
  }

  it("is deterministic for a given seed", () => {
    assert.deepEqual(generatePuzzle("hard", 42), generatePuzzle("hard", 42));
  });

  it("orders difficulties by clue count", () => {
    const clues = DIFFICULTIES.map((d) => countClues(generatePuzzle(d, 7).puzzle));
    assert.deepEqual([...clues].sort((a, b) => b - a), clues);
  });
});

describe("tournament scoring", () => {
  it("rewards difficulty, podium and flawless solves", () => {
    assert.equal(scoreMatch("easy", { completed: true, place: 4, mistakes: 1 }), 10);
    assert.equal(scoreMatch("medium", { completed: true, place: 1, mistakes: 0 }), 35);
    assert.equal(scoreMatch("expert", { completed: true, place: 2, mistakes: 2 }), 50);
    assert.equal(scoreMatch("hard", { completed: false, place: null, mistakes: 3 }), 2);
  });

  it("buckets months in the tournament time zone", () => {
    // 2026-01-31 17:00 UTC is already 1 Feb in Singapore.
    assert.equal(monthKey(Date.UTC(2026, 0, 31, 17), "Asia/Singapore"), "2026-02");
    assert.equal(monthKey(Date.UTC(2026, 0, 31, 17), "UTC"), "2026-01");
    assert.equal(shiftMonth("2026-01", -1), "2025-12");
    assert.equal(shiftMonth("2026-12", 1), "2027-01");
  });
});

describe("multiplayer rooms", () => {
  const player = (id: string): PlayerRecord => ({ id, name: id.toUpperCase(), tokenHash: "", createdAt: 0 });
  const setup = (n: number, withLeague = false) => {
    const db: Db = { version: 1, players: {}, rooms: {}, leagues: {}, matches: [] };
    const players = Array.from({ length: n }, (_, k) => player(`p${k}`));
    for (const p of players) db.players[p.id] = p;
    const league = withLeague ? createLeague(db, players[0], "Family") : null;
    const room = createRoom(db, players[0], { difficulty: "easy", maxPlayers: n, leagueCode: league?.code });
    for (const p of players.slice(1)) joinRoom(db, room, p);
    return { db, players, room, league };
  };
  const solveAll = (db: Db, room: RoomRecord, id: string, t: number) => {
    for (let i = 0; i < 81; i++) {
      if (room.puzzle![i] === "0") applyMove(db, room, id, { index: i, value: room.solution![i] }, t);
    }
  };

  it("enforces the player cap", () => {
    const { db, room } = setup(3);
    assert.throws(() => joinRoom(db, room, player("extra")), /full/);
  });

  it("validates moves server-side and eliminates after three mistakes", () => {
    const { db, players, room } = setup(2);
    const t0 = Date.now();
    startRoom(room, players[0].id, t0);
    const t = room.startedAt! + 1000;
    const empty = room.puzzle!.indexOf("0");
    const wrong = (Number(room.solution![empty]) % 9) + 1;
    assert.throws(() => applyMove(db, room, players[1].id, { index: empty, value: wrong }, t0), /countdown/);
    for (let k = 1; k <= MAX_MISTAKES; k++) {
      const res = applyMove(db, room, players[1].id, { index: empty, value: wrong }, t);
      assert.equal(res.correct, false);
      assert.equal(res.mistakes, k);
    }
    assert.ok(room.members[1].eliminated);
    assert.throws(() => applyMove(db, room, players[1].id, { index: empty, value: 1 }, t), /out/);
    assert.equal(room.status, "playing");

    solveAll(db, room, players[0].id, t + 5000);
    assert.equal(room.status, "finished");
    const view = roomView(db, room, players[0].id, t + 6000);
    assert.equal(view.players[0].id, players[0].id);
    assert.equal(view.solution, room.solution);
  });

  it("hides the puzzle during the countdown", () => {
    const { db, players, room } = setup(2);
    const t0 = Date.now();
    startRoom(room, players[0].id, t0);
    assert.equal(roomView(db, room, players[1].id, t0 + 100).puzzle, null);
    assert.equal(roomView(db, room, players[1].id, room.startedAt!).puzzle, room.puzzle);
  });

  it("records league results and monthly standings", () => {
    const { db, players, room, league } = setup(3, true);
    const t0 = Date.now();
    startRoom(room, players[0].id, t0);
    const t = room.startedAt!;
    solveAll(db, room, players[2].id, t + 60_000);
    solveAll(db, room, players[0].id, t + 90_000);
    leaveRoom(db, room, players[1].id, t + 95_000); // forfeit ends the match
    assert.equal(room.status, "finished");
    assert.equal(db.matches.length, 1);

    const standings = computeStandings(db, league!.code, db.matches[0].month);
    assert.deepEqual(
      standings.map((s) => [s.playerId, s.points, s.rank]),
      [
        ["p2", 20, 1], // easy 10 × 1.5 + flawless 5
        ["p0", 18, 2], // easy 10 × 1.25 (rounded) + flawless 5
        ["p1", 2, 3], // participation
      ],
    );
    assert.equal(computeStandings(db, league!.code, shiftMonth(db.matches[0].month, -1)).length, 0);
  });

  it("times out matches and lets the host end early", () => {
    const { db, players, room } = setup(2);
    startRoom(room, players[0].id, 0);
    finalizeIfDone(db, room, room.endsAt! - 1);
    assert.equal(room.status, "playing");
    assert.throws(() => endRoom(db, room, players[1].id), /host/);
    endRoom(db, room, players[0].id, room.startedAt! + 10);
    assert.equal(room.status, "finished");
  });

  it("enrols invitees into the room's league", () => {
    const { db, league } = setup(3, true);
    assert.equal(db.leagues[league!.code].memberIds.length, 3);
  });
});
