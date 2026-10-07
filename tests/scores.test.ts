import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  challengeBlock,
  listBoard,
  listNotifications,
  markRead,
  MAX_NOTIFICATIONS,
  postScore,
  puzzleLadder,
  scoreDetail,
  startChallenge,
  submitChallenge,
} from "@/lib/server/scores";
import type { Db, PlayerRecord } from "@/lib/server/store";
import { dailyDifficulty, dailySeed, dayKey } from "@/lib/sudoku/progress";
import { generatePuzzle } from "@/lib/sudoku/puzzles";
import { newGameState, enter } from "@/lib/sudoku/game";
import { playGame } from "./helpers";

const player = (id: string, name = id.toUpperCase()): PlayerRecord => ({ id, name, tokenHash: "", createdAt: 0 });
const world = (...ids: string[]) => {
  const db: Db = { version: 1, players: {}, rooms: {}, leagues: {}, matches: [] };
  const ps = ids.map((id) => player(id));
  for (const p of ps) db.players[p.id] = p;
  return { db, ps };
};
const body = (g: ReturnType<typeof playGame>) => ({ baseId: g.baseId, seed: g.seed, log: g.log, lives: g.lives });
const T0 = 1_800_000_000_000;

describe("posting scores", () => {
  it("recomputes the score on the server and ranks it", () => {
    const { db, ps } = world("a");
    const g = playGame("medium", 3);
    const r = postScore(db, ps[0], body(g), T0);
    assert.equal(r.entry.score, (g.g.status === "won" ? r.entry.score : -1));
    assert.equal(r.puzzleRank, 1);
    assert.equal(r.boardRank, 1);
    assert.equal(r.entry.mine, true);
    assert.equal(r.replaced, false);
  });

  it("ignores any score the client claims", () => {
    const { db, ps } = world("a");
    const g = playGame("medium", 3);
    const honest = postScore(db, ps[0], body(g), T0).entry.score;
    const { db: db2, ps: ps2 } = world("a");
    const r = postScore(db2, ps2[0], { ...body(g), score: 999999 } as never, T0);
    assert.equal(r.entry.score, honest);
  });

  it("rejects a log that isn't a win, a forged puzzle and rapid-fire posting", () => {
    const { db, ps } = world("a");
    const g = playGame("easy", 4);
    assert.throws(() => postScore(db, ps[0], { ...body(g), log: g.log.slice(0, -2) }, T0), /wasn't won|match/);
    assert.throws(() => postScore(db, ps[0], { ...body(g), baseId: "easy:0", seed: 1 }, T0), /match the puzzle|fail|wasn't won/);
    postScore(db, ps[0], body(g), T0);
    const g2 = playGame("easy", 5);
    assert.throws(() => postScore(db, ps[0], body(g2), T0 + 1000), /Slow down/);
    assert.doesNotThrow(() => postScore(db, ps[0], body(g2), T0 + 10_000));
  });

  it("a better run on the same puzzle replaces the old one; a worse one is refused", () => {
    const { db, ps } = world("a");
    const slow = playGame("easy", 6, { msPerMove: 6000, wrong: true });
    const fast = playGame("easy", 6, { msPerMove: 2000 });
    assert.equal(slow.puzzle, fast.puzzle);
    const first = postScore(db, ps[0], body(slow), T0);
    const better = postScore(db, ps[0], body(fast), T0 + 20_000);
    assert.equal(better.replaced, true);
    assert.equal(better.entry.id, first.entry.id);
    assert.ok(better.entry.score > first.entry.score);
    assert.throws(() => postScore(db, ps[0], body(slow), T0 + 60_000), /already have/);
    assert.equal(db.scores!.length, 1);
  });

  it("keeps suspiciously fast games off the boards and out of the news", () => {
    const { db, ps } = world("a", "b");
    postScore(db, ps[0], body(playGame("hard", 2)), T0);
    const quick = playGame("hard", 8, { msPerMove: 450 });
    const r = postScore(db, ps[1], body(quick), T0 + 10_000);
    assert.equal(r.entry.flagged, true);
    assert.equal(r.boardRank, null);
    const board = listBoard(db, { board: "all", tier: "hard", viewerId: ps[0].id }) as { entries: { playerId: string }[] };
    assert.deepEqual(board.entries.map((e) => e.playerId), ["a"]);
    assert.equal(listNotifications(db, "a").unread, 0);
  });

  it("only today's or yesterday's daily puzzle can be posted as the daily", () => {
    const { db, ps } = world("a");
    const key = dayKey(T0);
    const d = generatePuzzle(dailyDifficulty(key), dailySeed(key));
    let g = newGameState(d, { lives: 3 });
    let t = 0;
    for (let i = 0; i < 81; i++) {
      if (g.puzzle[i] !== "0") continue;
      g = { ...g, elapsedMs: (t += 2500) };
      g = enter(g, i, Number(g.solution[i])).state;
    }
    const daily = { baseId: g.baseId, seed: g.seed, log: g.log, lives: 3 };
    const r = postScore(db, ps[0], { ...daily, daily: key }, T0);
    assert.equal(r.entry.source, "daily");
    assert.equal((listBoard(db, { board: "daily", now: T0 }) as { entries: unknown[] }).entries.length, 1);
    const { db: db2, ps: ps2 } = world("a");
    assert.throws(() => postScore(db2, ps2[0], { ...daily, daily: "2020-01-01" }, T0), /no longer open/);
    const other = playGame("easy", 1);
    assert.throws(() => postScore(db2, ps2[0], { ...body(other), daily: key }, T0), /wasn't the daily/);
  });
});

describe("thrones and notifications", () => {
  it("losing #1 on the level board tells the old champion", () => {
    const { db, ps } = world("a", "b");
    postScore(db, ps[0], body(playGame("hard", 2, { msPerMove: 5000, wrong: true })), T0);
    postScore(db, ps[1], body(playGame("hard", 3, { msPerMove: 2000 })), T0 + 10_000);
    const inbox = listNotifications(db, "a");
    assert.equal(inbox.unread, 1);
    assert.equal(inbox.items[0].kind, "dethroned-board");
    assert.match(inbox.items[0].title, /lost #1 on the Hard board/);
    assert.equal(listNotifications(db, "b").unread, 0, "the new champion isn't told");
  });

  it("a worse score on another puzzle changes nothing", () => {
    const { db, ps } = world("a", "b");
    postScore(db, ps[0], body(playGame("hard", 2, { msPerMove: 2000 })), T0);
    postScore(db, ps[1], body(playGame("hard", 3, { msPerMove: 6000, wrong: true })), T0 + 10_000);
    assert.equal(listNotifications(db, "a").unread, 0);
  });

  it("a challenger who beats a score takes the puzzle's throne, and the holder hears once about the puzzle", () => {
    const { db, ps } = world("a", "b");
    const a = playGame("hard", 2, { msPerMove: 5000, wrong: true });
    const posted = postScore(db, ps[0], body(a), T0).entry;
    const start = startChallenge(db, ps[1], posted.id, T0 + 5000);
    assert.equal(start.baseId, a.baseId);
    const b = playGame("hard", 2, { msPerMove: 2000 });
    assert.equal(b.puzzle, a.puzzle);
    const res = submitChallenge(db, ps[1], posted.id, body(b), T0 + 60_000);
    assert.equal(res.beat, true);
    assert.equal(res.puzzleRank, 1);
    assert.equal(res.target.playerName, "A");
    const kinds = listNotifications(db, "a").items.map((n) => n.kind).sort();
    assert.deepEqual(kinds, ["dethroned", "dethroned-board"], "puzzle throne + level board, no duplicate 'beaten'");
    assert.equal(puzzleLadder(db, a.puzzle)[0].playerId, "b");
  });

  it("losing a challenge notifies nobody and still lands on the ladder", () => {
    const { db, ps } = world("a", "b");
    const a = playGame("medium", 4, { msPerMove: 2000 });
    const posted = postScore(db, ps[0], body(a), T0).entry;
    startChallenge(db, ps[1], posted.id, T0 + 1000);
    const b = playGame("medium", 4, { msPerMove: 6000, wrong: true });
    const res = submitChallenge(db, ps[1], posted.id, body(b), T0 + 90_000);
    assert.equal(res.beat, false);
    assert.equal(res.puzzleRank, 2);
    assert.equal(listNotifications(db, "a").unread, 0);
    assert.equal(scoreDetail(db, posted.id, ps[0]).ladder.length, 2);
  });

  it("beating someone who isn't #1 sends them a 'beaten' note", () => {
    const { db, ps } = world("a", "b", "c");
    // Speeds chosen so the time bonus differs (it is capped at x1.5 for very fast play).
    const top = playGame("medium", 4, { msPerMove: 1800 });
    const mid = playGame("medium", 4, { msPerMove: 9000 });
    const challenger = playGame("medium", 4, { msPerMove: 6000 });
    postScore(db, ps[0], body(top), T0);
    const midPosted = postScore(db, ps[1], body(mid), T0 + 10_000).entry;
    startChallenge(db, ps[2], midPosted.id, T0 + 20_000);
    const res = submitChallenge(db, ps[2], midPosted.id, body(challenger), T0 + 90_000);
    assert.equal(res.beat, true);
    assert.equal(res.puzzleRank, 2, "behind the champion, ahead of the challenged player");
    assert.deepEqual(listNotifications(db, "b").items.map((n) => n.kind), ["beaten"]);
    assert.equal(listNotifications(db, "a").unread, 0, "the champion keeps the throne");
  });

  it("enforces one scored attempt per player per puzzle", () => {
    const { db, ps } = world("a", "b");
    const a = playGame("easy", 6, { msPerMove: 2500 });
    const posted = postScore(db, ps[0], body(a), T0).entry;
    assert.throws(() => startChallenge(db, ps[0], posted.id, T0 + 1), /your own score/);
    assert.throws(() => submitChallenge(db, ps[1], posted.id, body(a), T0 + 1), /Start the challenge first/);
    startChallenge(db, ps[1], posted.id, T0 + 10);
    assert.throws(() => startChallenge(db, ps[1], posted.id, T0 + 20), /already attempted/);
    const wrongPuzzle = playGame("easy", 7);
    assert.throws(() => submitChallenge(db, ps[1], posted.id, body(wrongPuzzle), T0 + 60_000), /isn't the puzzle/);
    submitChallenge(db, ps[1], posted.id, body(playGame("easy", 6, { msPerMove: 2600 })), T0 + 60_000);
    assert.throws(() => submitChallenge(db, ps[1], posted.id, body(playGame("easy", 6)), T0 + 70_000), /already submitted|already/);
    assert.match(challengeBlock(db, ps[1], db.scores![0])!, /already/);
  });

  it("an abandoned attempt still uses up the player's one try", () => {
    const { db, ps } = world("a", "b");
    const posted = postScore(db, ps[0], body(playGame("easy", 6)), T0).entry;
    startChallenge(db, ps[1], posted.id, T0 + 10);
    const detail = scoreDetail(db, posted.id, ps[1]);
    assert.equal(detail.challenge.ok, false);
  });

  it("inbox: read state, newest first, capped", () => {
    const { db } = world("a");
    db.notifications = Array.from({ length: MAX_NOTIFICATIONS + 5 }, (_, i) => ({
      id: `n${i}`, playerId: "a", at: i, kind: "beaten" as const, title: `t${i}`, body: "", href: "/", read: false,
    }));
    const inbox = listNotifications(db, "a");
    assert.equal(inbox.items[0].id, `n${MAX_NOTIFICATIONS + 4}`);
    assert.equal(inbox.items.length, 50);
    markRead(db, "a", [`n${MAX_NOTIFICATIONS + 4}`]);
    assert.equal(listNotifications(db, "a").unread, MAX_NOTIFICATIONS + 4);
    markRead(db, "a", "all");
    assert.equal(listNotifications(db, "a").unread, 0);
  });
});

describe("boards", () => {
  it("rank by score, filter by level, window by week, and total per player", () => {
    const { db, ps } = world("a", "b");
    postScore(db, ps[0], body(playGame("easy", 6, { msPerMove: 2500 })), T0);
    postScore(db, ps[0], body(playGame("hard", 2, { msPerMove: 2500 })), T0 + 10_000);
    postScore(db, ps[1], body(playGame("hard", 3, { msPerMove: 3000 })), T0 + 20_000);
    const all = listBoard(db, { board: "all", viewerId: "a", now: T0 + 30_000 }) as { entries: { rank: number; score: number; mine: boolean; difficulty: string }[] };
    assert.equal(all.entries.length, 3);
    assert.deepEqual(all.entries.map((e) => e.rank), [1, 2, 3]);
    assert.ok(all.entries[0].score >= all.entries[1].score && all.entries[1].score >= all.entries[2].score);
    const hard = listBoard(db, { board: "all", tier: "hard", now: T0 + 30_000 }) as { entries: unknown[] };
    assert.equal(hard.entries.length, 2);
    const weekLater = listBoard(db, { board: "week", now: T0 + 8 * 86_400_000 }) as { entries: unknown[] };
    assert.equal(weekLater.entries.length, 0);
    const players = listBoard(db, { board: "players", viewerId: "a" }) as { players: { playerId: string; total: number; puzzles: number; mine: boolean }[] };
    assert.equal(players.players.length, 2);
    assert.equal(players.players[0].playerId, "a");
    assert.equal(players.players[0].puzzles, 2);
    assert.equal(players.players[0].mine, true);
  });
});
