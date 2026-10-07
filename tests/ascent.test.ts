import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { afterPuzzle, MAX_LEVEL, newRun, tierOfRun } from "@/lib/sudoku/ascent";
import { DIFFICULTIES } from "@/lib/sudoku/engine";
import { enter, freshGame, scoreOf } from "@/lib/sudoku/game";
import { puzzleFromRecord } from "@/lib/sudoku/replay";
import { generatePuzzle } from "@/lib/sudoku/puzzles";
import { isRanked, newGameState } from "@/lib/sudoku/game";

describe("ascent runs", () => {
  it("climbs one tier per clear and stops at the top", () => {
    let run = newRun(3);
    const seen: string[] = [];
    for (let i = 0; i < 9; i++) {
      seen.push(tierOfRun(run));
      run = afterPuzzle(run, { kind: "won", livesLost: 0, points: 100 });
    }
    assert.deepEqual(seen.slice(0, 6), [...DIFFICULTIES]);
    assert.deepEqual(seen.slice(6), ["master", "master", "master"]);
    assert.equal(run.cleared, 9);
    assert.equal(run.points, 900);
    assert.equal(run.level, MAX_LEVEL);
  });

  it("lives are one pool for the whole run", () => {
    let run = newRun(5);
    run = afterPuzzle(run, { kind: "won", livesLost: 2, points: 50 });
    assert.equal(run.remaining, 3);
    run = afterPuzzle(run, { kind: "won", livesLost: 1, points: 50 });
    assert.equal(run.remaining, 2);
    assert.equal(run.status, "active");
  });

  it("running out of lives ends the run, and tracks the top tier cleared", () => {
    let run = newRun(2);
    run = afterPuzzle(run, { kind: "won", livesLost: 0, points: 10 });
    run = afterPuzzle(run, { kind: "won", livesLost: 0, points: 10 });
    run = afterPuzzle(run, { kind: "lost" });
    assert.equal(run.status, "over");
    assert.equal(run.remaining, 0);
    assert.equal(run.topCleared, 1);
  });

  it("showing a solution keeps the run alive at the same level", () => {
    let run = newRun(3);
    run = afterPuzzle(run, { kind: "won", livesLost: 0, points: 10 });
    const before = run.level;
    run = afterPuzzle(run, { kind: "revealed", livesLost: 1 });
    assert.equal(run.level, before);
    assert.equal(run.remaining, 2);
    assert.equal(run.status, "active");
    assert.equal(run.cleared, 1);
  });

  it("a reveal never leaves a run with zero lives", () => {
    const run = afterPuzzle(newRun(1), { kind: "revealed", livesLost: 5 });
    assert.equal(run.remaining, 1);
  });
});

describe("ascent games and replays", () => {
  it("score with the lives chosen for the run, not what's left", () => {
    const run = newRun(1);
    const game = freshGame("beginner", run.remaining, undefined, 4, { kind: "ascent", pool: { chosen: run.chosen } });
    let g = game;
    for (let i = 0; i < 81; i++) if (g.puzzle[i] === "0") g = enter(g, i, Number(g.solution[i])).state;
    const pooled = scoreOf(g);
    const plain = scoreOf({ ...g, pool: undefined, lives: 1 });
    assert.equal(pooled.livesChosen, plain.livesChosen);
    assert.ok(pooled.total > 0);
  });

  it("replays score nothing and are not ranked", () => {
    const p = generatePuzzle("easy", 12);
    let g = newGameState(p, { lives: 3, kind: "replay" });
    assert.equal(isRanked(g), false);
    for (let i = 0; i < 81; i++) if (g.puzzle[i] === "0") g = enter(g, i, Number(g.solution[i])).state;
    assert.equal(g.status, "won");
    assert.equal(scoreOf(g).total, 0);
  });

  it("rebuilds the exact puzzle of a past game", () => {
    const p = generatePuzzle("hard", 99);
    const again = puzzleFromRecord({ puzzle: p.puzzle, difficulty: p.difficulty, seed: p.seed, rating: p.rating, parMs: p.parMs, baseId: p.baseId });
    assert.deepEqual(again, p);
  });

  it("retrying reproduces the same puzzle even when the first deal skipped revealed ones", () => {
    const first = freshGame("hard", 3, undefined, 5);
    const skipped = freshGame("hard", 3, new Set([first.baseId]), 5);
    assert.notEqual(skipped.puzzle, first.puzzle);
    // The saved game carries everything needed to deal it again exactly.
    const again = newGameState(
      { puzzle: skipped.puzzle, solution: skipped.solution, difficulty: skipped.difficulty, seed: skipped.seed, rating: skipped.rating, parMs: skipped.parMs, baseId: skipped.baseId },
      { lives: 3 },
    );
    assert.equal(again.puzzle, skipped.puzzle);
  });
});
