import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scoreOf, type MoveEvent } from "@/lib/sudoku/game";
import { verifyGame } from "@/lib/sudoku/verify";
import { playGame } from "./helpers";

const play = playGame;

describe("score verification", () => {
  it("accepts an honest game and recomputes exactly the client's score", () => {
    const { g, log, baseId, seed, lives } = play("medium", 3, { hint: true, away: true, wrong: true });
    assert.equal(g.status, "won");
    const r = verifyGame({ baseId, seed, log, lives });
    assert.ok(r.ok, r.ok ? "" : r.reason);
    if (!r.ok) return;
    assert.equal(r.game.score.total, scoreOf(g).total);
    assert.equal(r.game.livesLost, g.livesLost);
    assert.equal(r.game.hints, 1);
    assert.equal(r.game.maxCombo, g.maxCombo);
    assert.equal(r.game.flagged, false);
  });

  it("the away event matters: hiding it would raise the score", () => {
    const { log, baseId, seed, lives } = play("easy", 5, { away: true });
    const honest = verifyGame({ baseId, seed, log, lives });
    const hidden = verifyGame({ baseId, seed, log: log.filter((e) => e.k !== "away"), lives });
    assert.ok(honest.ok && hidden.ok);
    if (honest.ok && hidden.ok) assert.ok(hidden.game.score.total > honest.game.score.total);
  });

  it("rejects a log that isn't a win", () => {
    const { log, baseId, seed, lives } = play("easy", 7);
    const r = verifyGame({ baseId, seed, log: log.slice(0, -1), lives });
    assert.equal(r.ok, false);
  });

  it("rejects moves that don't match the puzzle", () => {
    const { log, baseId, seed, lives } = play("easy", 7);
    const i = log.findIndex((e) => e.k === "place");
    const bad: MoveEvent[] = log.map((e, k) => (k === i ? { ...e, d: (e.d % 9) + 1 } : e));
    assert.equal(verifyGame({ baseId, seed, log: bad, lives }).ok, false);
  });

  it("rejects a log claiming a placement as wrong, or the reverse", () => {
    const { log, baseId, seed, lives } = play("easy", 7);
    const i = log.findIndex((e) => e.k === "place");
    const bad: MoveEvent[] = log.map((e, k) => (k === i ? { ...e, k: "wrong" as const } : e));
    assert.equal(verifyGame({ baseId, seed, log: bad, lives }).ok, false);
  });

  it("rejects superhuman speed and flags merely suspicious speed", () => {
    const robot = play("easy", 9, { msPerMove: 60 });
    assert.equal(verifyGame({ baseId: robot.baseId, seed: robot.seed, log: robot.log, lives: 3 }).ok, false);
    const quick = play("easy", 9, { msPerMove: 450 });
    const r = verifyGame({ baseId: quick.baseId, seed: quick.seed, log: quick.log, lives: 3 });
    assert.ok(r.ok);
    if (r.ok) assert.equal(r.game.flagged, true);
  });

  it("rejects bad inputs", () => {
    const { log, baseId, seed } = play("easy", 7);
    assert.equal(verifyGame({ baseId: "nope", seed, log, lives: 3 }).ok, false);
    assert.equal(verifyGame({ baseId: "easy:99999", seed, log, lives: 3 }).ok, false, "unknown bank puzzle");
    assert.equal(verifyGame({ baseId, seed: -1, log, lives: 3 }).ok, false);
    assert.equal(verifyGame({ baseId, seed, log, lives: 4 }).ok, false);
    assert.equal(verifyGame({ baseId, seed, log, lives: 0 }).ok, false, "practice games can't be posted");
    assert.equal(verifyGame({ baseId, seed, log: [], lives: 3 }).ok, false);
    assert.equal(verifyGame({ baseId, seed, log: [{ t: 5, k: "place", c: 99, d: 1 }], lives: 3 }).ok, false);
    assert.equal(verifyGame({ baseId, seed, log: [...log].reverse(), lives: 3 }).ok, false);
  });

  it("a different disguise of the same bank puzzle is a different puzzle: the log won't fit", () => {
    const { log, baseId, seed, lives } = play("easy", 7);
    assert.equal(verifyGame({ baseId, seed: seed + 1, log, lives }).ok, false);
  });

  it("rejects more hints than allowed", () => {
    const { log, baseId, seed, lives } = play("medium", 3);
    const extra: MoveEvent[] = [0, 1, 2, 3].map((n) => ({ t: 100 + n, k: "hint", c: 0, d: 1 }));
    assert.equal(verifyGame({ baseId, seed, log: [...extra, ...log.map((e) => ({ ...e, t: e.t + 1000 }))], lives }).ok, false);
  });
});
