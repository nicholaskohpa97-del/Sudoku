import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MoveEvent } from "@/lib/sudoku/game";
import { generatePuzzle } from "@/lib/sudoku/puzzles";
import { analyseGame, addToProfile, nextToLearn } from "@/lib/sudoku/strategy";
import { applyStep, nextStep, stateFromGrid, TECHNIQUES, type TechniqueId } from "@/lib/sudoku/solver";
import { isSolvedState } from "./helpers";

/** A player who follows the ladder and pencils out every elimination before filling in. */
function methodicalLog(puzzle: string, thinkMs: number): { log: MoveEvent[]; eliminationTechniques: TechniqueId[] } {
  const s = stateFromGrid(puzzle);
  const log: MoveEvent[] = [];
  const eliminationTechniques: TechniqueId[] = [];
  let t = 0;
  while (!isSolvedState(s)) {
    const step = nextStep(s)!;
    if (step.eliminations.length) {
      if (step.weight >= 2.6) eliminationTechniques.push(step.technique);
      for (const e of step.eliminations) {
        t += 400;
        log.push({ t, k: "note", c: e.cell, d: e.digit });
        t += 400;
        log.push({ t, k: "note", c: e.cell, d: e.digit });
      }
    }
    for (const p of step.placements) {
      t += step.weight >= 2.6 ? thinkMs : 3000;
      log.push({ t, k: "place", c: p.cell, d: p.digit });
    }
    applyStep(s, step);
  }
  return { log, eliminationTechniques };
}

describe("strategy detection", () => {
  it("recognises techniques shown by pencil-mark eliminations as demonstrated", () => {
    const p = generatePuzzle("hard", 31);
    const { log, eliminationTechniques } = methodicalLog(p.puzzle, 20_000);
    assert.ok(eliminationTechniques.length > 0);
    const report = analyseGame({ puzzle: p.puzzle, solution: p.solution, log, budgetMs: 20_000 });
    const demonstrated = new Set(report.techniques.filter((t) => t.evidence === "demonstrated").map((t) => t.technique));
    for (const id of eliminationTechniques) assert.ok(demonstrated.has(id), `missed ${id}`);
    assert.ok(report.hardestDemonstrated);
    assert.equal(report.guesses, 0);
    assert.ok(report.summary.length > 0);
  });

  it("calls fast, note-free placements that need a technique merely possible", () => {
    const p = generatePuzzle("hard", 31);
    const { log } = methodicalLog(p.puzzle, 1500);
    const onlyPlacements = log.filter((e) => e.k === "place").map((e, i) => ({ ...e, t: i * 1500 }));
    const report = analyseGame({ puzzle: p.puzzle, solution: p.solution, log: onlyPlacements, budgetMs: 20_000 });
    assert.ok(report.techniques.length > 0);
    assert.ok(report.techniques.every((t) => t.evidence === "possible"));
    assert.equal(report.hardestDemonstrated, null);
  });

  it("counts wrong entries as guesses", () => {
    const p = generatePuzzle("easy", 8);
    const empties = p.puzzle.split("").flatMap((c, i) => (c === "0" ? [i] : []));
    const log: MoveEvent[] = empties.slice(0, 3).map((c, i) => ({ t: i * 1000, k: "wrong", c, d: (Number(p.solution[c]) % 9) + 1 }));
    const report = analyseGame({ puzzle: p.puzzle, solution: p.solution, log });
    assert.equal(report.wrongEntries, 3);
    assert.equal(report.guesses, 3);
  });

  it("an easy puzzle only shows singles", () => {
    const p = generatePuzzle("beginner", 2);
    const { log } = methodicalLog(p.puzzle, 4000);
    const report = analyseGame({ puzzle: p.puzzle, solution: p.solution, log });
    assert.equal(report.techniques.length, 0);
    assert.ok(report.singles.hidden + report.singles.naked > 20);
  });

  it("tracks pencil-trial commits", () => {
    const p = generatePuzzle("beginner", 2);
    const { log } = methodicalLog(p.puzzle, 4000);
    const viaTrial = log.map((e) => (e.k === "place" ? { ...e, x: 1 as const } : e));
    const report = analyseGame({ puzzle: p.puzzle, solution: p.solution, log: viaTrial });
    assert.equal(report.trial.placed, report.trial.correct);
    assert.ok(report.trial.placed > 20);
  });

  it("flags techniques the puzzle forced but the moves don't show", () => {
    const p = generatePuzzle("expert", 4);
    const { log } = methodicalLog(p.puzzle, 1000);
    const bare = log.filter((e) => e.k === "place").map((e, i) => ({ ...e, t: i * 900 }));
    const report = analyseGame({ puzzle: p.puzzle, solution: p.solution, log: bare, budgetMs: 30_000 });
    assert.ok(report.forced.length > 0);
  });

  it("builds a skill profile and suggests what to learn next", () => {
    const p = generatePuzzle("hard", 31);
    const { log } = methodicalLog(p.puzzle, 20_000);
    const report = analyseGame({ puzzle: p.puzzle, solution: p.solution, log, budgetMs: 20_000 });
    const profile = addToProfile({}, report);
    const next = nextToLearn(profile);
    assert.ok(next);
    assert.ok(TECHNIQUES[next]);
    assert.equal(profile[report.techniques[0].technique]?.demonstrated, 1);
  });
});
