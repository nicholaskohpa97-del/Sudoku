import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeStandings, createLeague } from "@/lib/server/leagues";
import { applyMove, createRoom, endRoom, finalizeIfDone, joinRoom, leaveRoom, roomView, startRoom } from "@/lib/server/rooms";
import { selectBackend, stateStoreBackend, type Db, type PlayerRecord, type RoomRecord } from "@/lib/server/store";
import {
  completedUnits,
  countClues,
  countSolutions,
  DIFFICULTIES,
  DIFFICULTY_CONFIG,
  generatePuzzle,
  MAX_MISTAKES,
  solvableWithSingles,
} from "@/lib/sudoku/engine";
import { inviteEmailText, inviteMailto, parseEmails, parseInviteCode } from "@/lib/sudoku/invite";
import {
  comboMultiplier,
  dailyDifficulty,
  dailySeed,
  dayKey,
  emptyProgress,
  levelInfo,
  liveStreak,
  nextStreak,
  solveXp,
  starsFor,
  unlockedBy,
  XP_BASE,
  xpForLevel,
} from "@/lib/sudoku/progress";
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

describe("invites", () => {
  it("parses bare codes and pasted invite links", () => {
    assert.equal(parseInviteCode("abc123"), "ABC123");
    assert.equal(parseInviteCode("  ab-c 12 3 "), "ABC123");
    assert.equal(parseInviteCode("https://sudoku.example.com/sudoku/room/XYZ789"), "XYZ789");
    assert.equal(parseInviteCode("Join me! https://x.app/sudoku/league/k7pq2m?ref=1"), "K7PQ2M");
    assert.equal(parseInviteCode(""), "");
  });

  it("uses Supabase when configured and refuses the read-only file backend on Vercel", () => {
    const url = "https://abc.supabase.co";
    assert.equal(selectBackend({ VERCEL: "1" }), "unconfigured");
    assert.equal(selectBackend({ VERCEL: "1", SUPABASE_URL: url }), "unconfigured"); // no secret key
    assert.equal(selectBackend({ VERCEL: "1", SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: "k" }), "supabase");
    assert.equal(selectBackend({ NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SECRET_KEY: "sb_secret_x" }), "supabase");
    assert.equal(selectBackend({}), "file");
  });

});

describe("unit completion", () => {
  const { solution } = generatePuzzle("easy", 4242);

  it("detects a completed row, column and box independently", () => {
    // Fill only row 0: completing cell 4 finishes the row but not its column or box.
    const row = Array.from(solution, (ch, i) => (i < 9 ? ch : "0")).join("");
    assert.deepEqual(completedUnits(row, 4).map((u) => u.kind), ["row"]);

    const col = Array.from(solution, (ch, i) => (i % 9 === 2 ? ch : "0")).join("");
    assert.deepEqual(completedUnits(col, 2 + 9 * 5).map((u) => u.kind), ["col"]);

    const boxCells = [60, 61, 62, 69, 70, 71, 78, 79, 80];
    const box = Array.from(solution, (ch, i) => (boxCells.includes(i) ? ch : "0")).join("");
    const units = completedUnits(box, 70);
    assert.deepEqual(units.map((u) => [u.kind, u.index]), [["box", 8]]);
    assert.deepEqual([...units[0].cells].sort((a, b) => a - b), boxCells);
  });

  it("reports double and triple clears from one placement", () => {
    // Row 0 + column 0 + box 0 all filled: placing cell 0 clears three units.
    const full = Array.from(solution, (ch, i) =>
      Math.floor(i / 9) === 0 || i % 9 === 0 || (Math.floor(i / 9) < 3 && i % 9 < 3) ? ch : "0",
    ).join("");
    assert.equal(completedUnits(full, 0).length, 3);
    assert.equal(completedUnits(full, 1).length, 2); // row 0 + box 0; column 1 is incomplete
    assert.equal(completedUnits(full, 40).length, 0); // empty cell
  });

  it("returns nothing when the unit still has gaps", () => {
    const almost = solution.slice(0, 8) + "0" + "0".repeat(72);
    assert.equal(completedUnits(almost, 3).length, 0);
  });
});

describe("progression", () => {
  it("awards XP for solves, flawless play, combos and the daily", () => {
    assert.equal(solveXp({ difficulty: "easy", mistakes: 1, maxCombo: 0 }).total, XP_BASE.easy);
    const best = solveXp({ difficulty: "hard", mistakes: 0, maxCombo: 6, daily: true });
    assert.equal(best.total, XP_BASE.hard + Math.round(XP_BASE.hard * 0.5) + 6 * 5 + 50);
    assert.equal(best.lines.length, 4);
  });

  it("maps XP to levels and titles", () => {
    assert.equal(levelInfo(0).level, 1);
    assert.equal(levelInfo(49).level, 1);
    assert.equal(levelInfo(50).level, 2);
    assert.equal(levelInfo(xpForLevel(10)).title, "Grid Ninja");
    const mid = levelInfo(xpForLevel(4) + 10);
    assert.equal(mid.level, 4);
    assert.ok(mid.progress > 0 && mid.progress < 1);
  });

  it("rates solves with 1–3 stars", () => {
    assert.equal(starsFor("medium", 0, 60_000), 3);
    assert.equal(starsFor("medium", 2, 60_000), 2);
    assert.equal(starsFor("medium", 2, 60 * 60_000), 1);
  });

  it("builds combo multipliers", () => {
    assert.deepEqual([1, 3, 4, 7, 8, 20].map(comboMultiplier), [1, 1, 2, 2, 3, 3]);
  });

  it("gives everyone the same daily puzzle and keeps streaks", () => {
    const key = dayKey(Date.UTC(2026, 9, 4, 20, 0), "Asia/Singapore"); // 5 Oct in Singapore
    assert.equal(key, "2026-10-05");
    assert.equal(dailySeed(key), dailySeed("2026-10-05"));
    assert.notEqual(dailySeed(key), dailySeed("2026-10-06"));
    assert.equal(dailyDifficulty("2026-10-04"), "expert"); // Sunday
    assert.equal(dailyDifficulty("2026-10-05"), "easy"); // Monday

    assert.equal(nextStreak({ streak: 4, lastDaily: "2026-10-04" }, "2026-10-05"), 5);
    assert.equal(nextStreak({ streak: 4, lastDaily: "2026-10-05" }, "2026-10-05"), 4);
    assert.equal(nextStreak({ streak: 4, lastDaily: "2026-10-01" }, "2026-10-05"), 1);
    assert.equal(nextStreak({ streak: 4, lastDaily: "2026-09-30" }, "2026-10-01"), 5); // across a month
    assert.equal(liveStreak({ streak: 4, lastDaily: "2026-10-03" }, "2026-10-05"), 0);
  });

  it("unlocks achievements once", () => {
    const p = { ...emptyProgress(), solves: 1 };
    const ids = unlockedBy(p, { solved: { difficulty: "expert", mistakes: 0, elapsedMs: 4 * 60_000 }, unitsAtOnce: 3 });
    assert.deepEqual(ids.sort(), ["expert", "first-solve", "flawless", "speedster", "triple"]);
    assert.deepEqual(unlockedBy({ ...p, achievements: ids }, { unitsAtOnce: 3 }), []);
  });
});

describe("supabase state backend", () => {
  /** In-memory stand-in for the sudoku_state table, with optional injected conflicts. */
  function fakeStore() {
    let row: { data: Db; version: number } | null = null;
    let conflictsLeft = 0;
    const calls = { create: 0, replace: 0 };
    return {
      calls,
      row: () => row,
      /** Simulate another instance writing just before our next replace. */
      conflictNext(n = 1) {
        conflictsLeft = n;
      },
      store: {
        async load() {
          return row ? structuredClone(row) : null;
        },
        async create(data: Db) {
          calls.create++;
          if (row) return false;
          row = { data: structuredClone(data), version: 1 };
          return true;
        },
        async replace(data: Db, version: number) {
          calls.replace++;
          if (conflictsLeft > 0 && row) {
            conflictsLeft--;
            row = { data: { ...row.data, players: { ...row.data.players, other: { id: "other", name: "Other", tokenHash: "", createdAt: 1 } } }, version: row.version + 1 };
          }
          if (!row || row.version !== version) return false;
          row = { data: structuredClone(data), version: version + 1 };
          return true;
        },
      },
    };
  }
  const noSleep = async () => {};

  it("creates the row on first write, then updates it with a bumped version", async () => {
    const f = fakeStore();
    const backend = stateStoreBackend(f.store, noSleep);
    await backend.mutate((db) => {
      db.players.a = { id: "a", name: "A", tokenHash: "", createdAt: 0 };
    });
    assert.equal(f.row()?.version, 1);
    await backend.mutate((db) => {
      db.players.b = { id: "b", name: "B", tokenHash: "", createdAt: 0 };
    });
    assert.equal(f.row()?.version, 2);
    assert.deepEqual(Object.keys(f.row()!.data.players).sort(), ["a", "b"]);
  });

  it("retries on a concurrent write without losing the other writer's change", async () => {
    const f = fakeStore();
    const backend = stateStoreBackend(f.store, noSleep);
    await backend.mutate((db) => {
      db.players.a = { id: "a", name: "A", tokenHash: "", createdAt: 0 };
    });
    f.conflictNext(2);
    const result = await backend.mutate((db) => {
      db.players.b = { id: "b", name: "B", tokenHash: "", createdAt: 0 };
      return "ok";
    });
    assert.equal(result, "ok");
    assert.deepEqual(Object.keys(f.row()!.data.players).sort(), ["a", "b", "other"]);
    assert.equal(f.calls.replace, 3);
  });

  it("writes nothing when the change throws", async () => {
    const f = fakeStore();
    const backend = stateStoreBackend(f.store, noSleep);
    await assert.rejects(
      backend.mutate(() => {
        throw new Error("nope");
      }),
    );
    assert.equal(f.calls.create, 0);
    assert.equal(f.row(), null);
  });
});

describe("email invites", () => {
  it("splits, validates and de-duplicates pasted addresses", () => {
    const { valid, invalid } = parseEmails("Auntie.May@Gmail.com, ben@yahoo.com;ben@yahoo.com\n<kim@x.sg>  not-an-email  a@b");
    assert.deepEqual(valid, ["auntie.may@gmail.com", "ben@yahoo.com", "kim@x.sg"]);
    assert.deepEqual(invalid, ["not-an-email", "a@b"]);
    assert.deepEqual(parseEmails("   "), { valid: [], invalid: [] });
  });

  it("builds a mailto link with all recipients and the invite text", () => {
    const href = inviteMailto(["a@x.com", "b+test@y.com"], {
      kind: "room",
      code: "ABC123",
      url: "https://sudoku.example/sudoku/room/ABC123",
      from: "Nic",
    });
    assert.ok(href.startsWith("mailto:a@x.com,b%2Btest@y.com?subject="));
    const params = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    assert.match(params.get("subject")!, /^Nic invited you to a Sudoku race/);
    assert.match(params.get("body")!, /https:\/\/sudoku\.example\/sudoku\/room\/ABC123/);
    assert.match(params.get("body")!, /code ABC123/);
  });

  it("words tournament invites with the tournament name", () => {
    const { subject, body } = inviteEmailText({ kind: "tournament", code: "K7PQ2M", name: "Koh Family Cup", url: "u" });
    assert.match(subject, /^A friend invited you to "Koh Family Cup"/);
    assert.match(body, /the "Koh Family Cup" Sudoku tournament/);
  });
});
