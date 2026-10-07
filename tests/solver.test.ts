import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BANK } from "@/lib/sudoku/bank";
import { countSolutions, createRng, DIFFICULTIES, DIFFICULTY_CONFIG, solve, tierForCeiling, tierForEmpties } from "@/lib/sudoku/engine";
import { applyTransform, generatePuzzle, randomTransform } from "@/lib/sudoku/puzzles";
import {
  applyStep,
  bit,
  cloneState,
  isSolved,
  nextStep,
  placeDigit,
  ratePuzzle,
  solveWithSteps,
  stateFromGrid,
  TECHNIQUES,
  type State,
} from "@/lib/sudoku/solver";
import { fullHouse, hiddenSingleBox, nakedSingle, pointing } from "@/lib/sudoku/solver/techniques/basic";
import { fish } from "@/lib/sudoku/solver/techniques/fish";
import { nakedSubset, hiddenSubset } from "@/lib/sudoku/solver/techniques/subsets";
import { xyWing } from "@/lib/sudoku/solver/techniques/wings";

/** An empty grid where every cell still has every candidate. */
function blank(): State {
  return stateFromGrid("0".repeat(81));
}
const only = (s: State, cell: number, ...digits: number[]) => {
  s.cand[cell] = digits.reduce((m, d) => m | bit(d), 0);
};
const has = (list: { cell: number; digit: number }[], cell: number, digit: number) =>
  list.some((e) => e.cell === cell && e.digit === digit);

describe("techniques on hand-built candidate grids", () => {
  it("full house: the last empty cell in a row", () => {
    const solution = solve("0".repeat(81))!;
    const grid = Array.from(solution);
    grid[4] = "0";
    const step = fullHouse(stateFromGrid(grid.join("")))!;
    assert.equal(step.technique, "full-house");
    assert.deepEqual(step.placements, [{ cell: 4, digit: Number(solution[4]) }]);
  });

  it("hidden single in a box", () => {
    const s = blank();
    for (const c of [1, 2, 9, 10, 11, 18, 19, 20]) s.cand[c] &= ~bit(5);
    const step = hiddenSingleBox(s)!;
    assert.deepEqual(step.placements, [{ cell: 0, digit: 5 }]);
    assert.equal(step.weight, 1.2);
  });

  it("naked single", () => {
    const s = blank();
    only(s, 30, 7);
    assert.deepEqual(nakedSingle(s)!.placements, [{ cell: 30, digit: 7 }]);
  });

  it("pointing pair clears the rest of the row", () => {
    const s = blank();
    for (const c of [9, 10, 11, 18, 19, 20]) s.cand[c] &= ~bit(7);
    const step = pointing(s)!;
    assert.equal(step.technique, "pointing");
    assert.ok(has(step.eliminations, 3, 7));
    assert.ok(!has(step.eliminations, 0, 7));
  });

  it("naked pair removes its digits from the rest of the unit", () => {
    const s = blank();
    only(s, 0, 1, 2);
    only(s, 1, 1, 2);
    const step = nakedSubset(s, 2)!;
    assert.equal(step.technique, "naked-pair");
    assert.ok(has(step.eliminations, 2, 1) && has(step.eliminations, 2, 2));
  });

  it("hidden pair strips other candidates from its two cells", () => {
    const s = blank();
    // In row 0, digits 8 and 9 only fit cells 0 and 1.
    for (let c = 2; c < 9; c++) s.cand[c] &= ~(bit(8) | bit(9));
    const step = hiddenSubset(s, 2)!;
    assert.equal(step.technique, "hidden-pair");
    assert.ok(has(step.eliminations, 0, 1) && has(step.eliminations, 1, 4));
    assert.ok(!has(step.eliminations, 0, 8));
  });

  it("X-Wing clears the digit from the columns outside its rows", () => {
    const s = blank();
    for (const r of [1, 5]) for (let c = 0; c < 9; c++) if (c !== 2 && c !== 6) s.cand[r * 9 + c] &= ~bit(5);
    const step = fish(s, 2)!;
    assert.equal(step.technique, "x-wing");
    assert.ok(has(step.eliminations, 0 * 9 + 2, 5) && has(step.eliminations, 8 * 9 + 6, 5));
    assert.ok(!has(step.eliminations, 1 * 9 + 2, 5));
  });

  it("XY-Wing removes the shared digit where both pincers look", () => {
    const s = blank();
    only(s, 0, 1, 2); // pivot
    only(s, 4, 1, 3); // pincer in the pivot's row
    only(s, 36, 2, 3); // pincer in the pivot's column
    const step = xyWing(s)!;
    assert.equal(step.technique, "xy-wing");
    assert.ok(has(step.eliminations, 40, 3));
  });
});

describe("cheapest-first solver", () => {
  it("solves a whole bank puzzle and ends on the real solution", () => {
    const p = generatePuzzle("medium", 11);
    const trace = solveWithSteps(p.puzzle);
    assert.ok(trace.solved);
    const s = stateFromGrid(p.puzzle);
    for (const st of trace.steps) applyStep(s, st);
    assert.equal(Array.from(s.cells).join(""), p.solution);
  });

  it("respects maxWeight", () => {
    const p = generatePuzzle("expert", 3);
    assert.equal(ratePuzzle(p.puzzle, { maxWeight: 2 }), null);
    assert.ok(ratePuzzle(p.puzzle));
  });

  it("never applies a step that contradicts the solution (soundness fuzz)", () => {
    for (const tier of DIFFICULTIES) {
      for (let seed = 1; seed <= 12; seed++) {
        const p = generatePuzzle(tier, seed * 7919);
        const s = stateFromGrid(p.puzzle);
        let guard = 0;
        while (!isSolved(s) && guard++ < 400) {
          const step = nextStep(s);
          assert.ok(step, `${tier} ${p.puzzle} got stuck`);
          for (const pl of step.placements) assert.equal(String(pl.digit), p.solution[pl.cell], `${step.technique} placed wrongly`);
          for (const e of step.eliminations) assert.notEqual(String(e.digit), p.solution[e.cell], `${step.technique} removed a true candidate`);
          applyStep(s, step);
        }
        assert.ok(isSolved(s));
      }
    }
  });

  it("steps carry the data the walkthrough needs", () => {
    const p = generatePuzzle("hard", 5);
    for (const st of solveWithSteps(p.puzzle).steps) {
      assert.ok(TECHNIQUES[st.technique], st.technique);
      assert.ok(st.weight >= 1);
      assert.ok(st.pattern.length > 0 || st.placements.length > 0);
      assert.ok(st.placements.length > 0 || st.eliminations.length > 0, `${st.technique} did nothing`);
    }
  });
});

describe("difficulty rating", () => {
  it("ratings are reproducible and the bank is correctly tiered", () => {
    for (const tier of DIFFICULTIES) {
      assert.ok(BANK[tier].length >= 100, `${tier} bank too small`);
      const band = DIFFICULTY_CONFIG[tier];
      for (const [grid, dr] of BANK[tier].filter((_, i) => i % 25 === 0)) {
        assert.equal(countSolutions(grid, 2), 1);
        const r = ratePuzzle(grid)!;
        assert.equal(r.tier, tier);
        assert.equal(r.dr, dr);
        assert.ok(r.ceiling >= band.minRating && r.ceiling < band.maxRating);
        assert.ok(r.logical);
      }
    }
  });

  it("tier bands tile the 1–10 scale without gaps or overlap", () => {
    for (let i = 1; i < DIFFICULTIES.length; i++) {
      assert.equal(DIFFICULTY_CONFIG[DIFFICULTIES[i - 1]].maxRating, DIFFICULTY_CONFIG[DIFFICULTIES[i]].minRating);
    }
    assert.equal(tierForCeiling(1.5), "beginner");
    assert.equal(tierForCeiling(2.3), "easy");
    assert.equal(tierForCeiling(3.8), "medium");
    assert.equal(tierForCeiling(5.4), "hard");
    assert.equal(tierForCeiling(6.9), "expert");
    assert.equal(tierForCeiling(7.5), "master");
  });

  it("scan load raises singles-level puzzles with few clues", () => {
    assert.equal(tierForEmpties(38), "beginner");
    assert.equal(tierForEmpties(45), "easy");
    assert.equal(tierForEmpties(55), "medium");
  });

  it("each tier is measurably harder than the last", () => {
    const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const stats = DIFFICULTIES.map((t) => {
      const rs = BANK[t].filter((_, i) => i % 6 === 0).map(([g]) => ratePuzzle(g)!);
      return { workload: med(rs.map((r) => r.workload)), par: med(rs.map((r) => r.parMs)), maxDr: Math.max(...rs.map((r) => r.dr)) };
    });
    for (let i = 1; i < stats.length; i++) {
      assert.ok(stats[i].workload > stats[i - 1].workload, `workload ${DIFFICULTIES[i]}`);
      assert.ok(stats[i].par > stats[i - 1].par, `par ${DIFFICULTIES[i]}`);
    }
  });

  it("master puzzles genuinely need forcing, and expert puzzles need chains", () => {
    for (const [grid] of BANK.master.filter((_, i) => i % 20 === 0)) {
      assert.ok(ratePuzzle(grid)!.ceiling >= 7);
    }
    for (const [grid] of BANK.expert.filter((_, i) => i % 30 === 0)) {
      const r = ratePuzzle(grid)!;
      assert.ok(r.ceiling >= 5.5 && r.ceiling < 7);
    }
  });

  it("transforms keep the puzzle valid and its rating", () => {
    const rng = createRng(99);
    for (const tier of ["easy", "hard", "expert"] as const) {
      const [grid, dr] = BANK[tier][3];
      const moved = applyTransform(grid, randomTransform(rng));
      assert.notEqual(moved, grid);
      assert.equal(countSolutions(moved, 2), 1);
      assert.equal(ratePuzzle(moved)!.dr, dr);
    }
  });

  it("cloneState/placeDigit leave the original untouched", () => {
    const s = blank();
    const t = cloneState(s);
    placeDigit(t, 0, 5);
    assert.equal(s.cells[0], 0);
    assert.equal(t.cells[0], 5);
  });
});
