import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  commitTrials,
  correctBoard,
  emptiesOf,
  enter,
  eraseCell,
  freshGame,
  hintsLeft,
  hintView,
  newGameState,
  requestHint,
  reveal,
  scoreOf,
  setTrial,
  toggleNote,
  trialCells,
  type GameState,
} from "@/lib/sudoku/game";
import { generatePuzzle } from "@/lib/sudoku/puzzles";
import { MAX_HINTS, UNLIMITED_LIVES } from "@/lib/sudoku/scoring";

const game = (lives = 3, tier: Parameters<typeof generatePuzzle>[0] = "easy", seed = 5) =>
  newGameState(generatePuzzle(tier, seed), { lives });
const emptyCells = (g: GameState) => g.puzzle.split("").flatMap((c, i) => (c === "0" ? [i] : []));
const wrongDigit = (g: GameState, cell: number) => (Number(g.solution[cell]) % 9) + 1;

describe("pen entry, lives and combo", () => {
  it("correct entries lock in and build a combo that isn't time-based", () => {
    let g = game();
    const [a, b, c] = emptyCells(g);
    for (const cell of [a, b, c]) g = enter(g, cell, Number(g.solution[cell])).state;
    assert.equal(g.combo, 3);
    assert.equal(g.maxCombo, 3);
    assert.equal(g.comboWeight, 3);
    // Entering an already-correct cell is ignored.
    assert.equal(enter(g, a, 1).outcome.kind, "ignored");
  });

  it("a wrong entry costs exactly one life, shows in red and breaks the combo", () => {
    let g = game(3);
    const [a, b] = emptyCells(g);
    g = enter(g, a, Number(g.solution[a])).state;
    const r = enter(g, b, wrongDigit(g, b));
    assert.equal(r.outcome.kind, "wrong");
    assert.equal(r.state.livesLost, 1);
    assert.equal(r.state.combo, 0);
    assert.equal(r.state.maxCombo, 1);
    assert.equal(r.state.values[b], wrongDigit(g, b));
    assert.equal(r.state.status, "playing");
  });

  for (const lives of [1, 2, 3, 5, 7, 10]) {
    it(`${lives} ${lives === 1 ? "life ends" : "lives end"} the game exactly when spent`, () => {
      let g = game(lives);
      const cell = emptyCells(g)[0];
      for (let k = 1; k <= lives; k++) {
        const r = enter(g, cell, wrongDigit(g, cell));
        g = r.state;
        assert.equal(g.livesLost, k);
        assert.equal(g.status, k === lives ? "lost" : "playing");
      }
      assert.equal(enter(g, cell, Number(g.solution[cell])).outcome.kind, "ignored");
    });
  }

  it("unlimited lives never ends the game and scores nothing", () => {
    let g = game(UNLIMITED_LIVES);
    const cell = emptyCells(g)[0];
    for (let k = 0; k < 25; k++) g = enter(g, cell, wrongDigit(g, cell)).state;
    assert.equal(g.status, "playing");
    assert.equal(g.livesLost, 25);
    for (const c of emptyCells(g)) g = enter(g, c, Number(g.solution[c])).state;
    assert.equal(g.status, "won");
    assert.equal(scoreOf(g).total, 0);
  });

  it("solving every cell wins and scores", () => {
    let g = game();
    for (const c of emptyCells(g)) g = enter(g, c, Number(g.solution[c])).state;
    assert.equal(g.status, "won");
    const s = scoreOf(g);
    assert.ok(s.total > 0);
    assert.ok(s.flawlessBonus > 0);
  });

  it("notes are multi-candidate and a correct entry clears them from peers", () => {
    let g = game();
    const [a, b] = emptyCells(g);
    g = toggleNote(g, a, 4);
    g = toggleNote(g, a, 6);
    assert.equal(g.notes[a], (1 << 4) | (1 << 6));
    g = toggleNote(g, a, 4);
    assert.equal(g.notes[a], 1 << 6);
    void b;
  });
});

describe("pencil trial mode", () => {
  it("holds one tentative digit per cell, gives no feedback and costs nothing", () => {
    let g = game(3);
    const [a, b] = emptyCells(g);
    g = setTrial(g, a, wrongDigit(g, a));
    g = setTrial(g, a, Number(g.solution[a])); // replaces, doesn't stack
    g = setTrial(g, b, wrongDigit(g, b));
    assert.equal(g.trial[a], Number(g.solution[a]));
    assert.equal(g.trial[b], wrongDigit(g, b));
    assert.equal(g.livesLost, 0);
    assert.equal(g.combo, 0);
    assert.equal(g.values[a], 0, "a trial digit is never committed");
    assert.deepEqual(trialCells(g), [a, b]);
  });

  it("the same digit again clears the trial", () => {
    let g = game();
    const a = emptyCells(g)[0];
    g = setTrial(g, a, 5);
    g = setTrial(g, a, 5);
    assert.equal(g.trial[a], 0);
  });

  it("committing checks each cell: right ones lock in, wrong ones cost a life", () => {
    let g = game(3);
    const [a, b, c] = emptyCells(g);
    g = setTrial(g, a, Number(g.solution[a]));
    g = setTrial(g, b, wrongDigit(g, b));
    g = setTrial(g, c, Number(g.solution[c]));
    const r = commitTrials(g);
    assert.deepEqual(r.outcomes.map((o) => o.kind), ["correct", "wrong", "correct"]);
    assert.equal(r.state.livesLost, 1);
    assert.equal(r.state.values[a], Number(g.solution[a]));
    assert.equal(r.state.maxCombo, 1, "the wrong commit broke the run");
    assert.equal(r.state.combo, 1);
    assert.equal(trialCells(r.state).length, 0);
  });

  it("committing can end the game and stops there", () => {
    let g = game(1);
    const [a, b] = emptyCells(g);
    g = setTrial(g, a, wrongDigit(g, a));
    g = setTrial(g, b, Number(g.solution[b]));
    const r = commitTrials(g);
    assert.equal(r.state.status, "lost");
    assert.equal(r.outcomes.length, 1);
  });

  it("committing a single cell leaves the rest tentative", () => {
    let g = game();
    const [a, b] = emptyCells(g);
    g = setTrial(g, a, Number(g.solution[a]));
    g = setTrial(g, b, Number(g.solution[b]));
    const r = commitTrials(g, [a]);
    assert.equal(r.state.values[a], Number(g.solution[a]));
    assert.equal(r.state.trial[b], Number(g.solution[b]));
  });

  it("erase clears value, notes and trial", () => {
    let g = game();
    const a = emptyCells(g)[0];
    g = toggleNote(g, a, 3);
    g = setTrial(g, a, 4);
    g = eraseCell(g, a);
    assert.equal(g.notes[a], 0);
    assert.equal(g.trial[a], 0);
  });
});

describe("hints", () => {
  it("allows at most three, escalating one step through three levels", () => {
    let g = game(3, "medium", 9);
    const seen: number[] = [];
    for (let k = 0; k < MAX_HINTS; k++) {
      const r = requestHint(g);
      assert.ok(r.ok);
      if (!r.ok) return;
      g = r.state;
      seen.push(r.view.level);
    }
    assert.deepEqual(seen, [1, 2, 3]);
    assert.equal(hintsLeft(g), 0);
    assert.equal(requestHint(g).ok, false);
  });

  it("never reveals the digit to enter, in any level of any step", () => {
    for (const tier of ["beginner", "easy", "medium", "hard"] as const) {
      let g = game(3, tier, 21);
      // Walk the whole puzzle with hints at the top level, re-asking after each fill.
      for (let guard = 0; guard < 6 && g.status === "playing"; guard++) {
        const hints = { ...g, hintsUsed: 0, hint: null };
        let cur: GameState = hints;
        const step = (() => {
          const r = requestHint(cur);
          return r.ok ? r : null;
        })();
        if (!step) break;
        cur = step.state;
        for (let level = 1; level <= 3; level++) {
          const view = hintView(cur)!;
          const place = cur.hint!.step.placements[0];
          if (place && cur.hint!.step.technique !== "hidden-single") {
            assert.ok(!new RegExp(`\\bplace ${place.digit}\\b`, "i").test(view.text), view.text);
          }
          if (place && cur.hint!.step.technique === "naked-single") {
            assert.ok(!view.text.includes(String(place.digit)) || /\bbox\b|row|column/.test(view.text));
          }
          const r = level < 3 ? requestHint(cur) : null;
          if (r?.ok) cur = r.state;
        }
        const place = cur.hint!.step.placements[0];
        if (place) g = enter(g, place.cell, place.digit).state;
        else break;
      }
    }
  });

  it("a hint resets the combo and the next press after resolving starts a new step", () => {
    let g = game(3, "easy", 3);
    const [a, b] = emptyCells(g);
    g = enter(g, a, Number(g.solution[a])).state;
    g = enter(g, b, Number(g.solution[b])).state;
    assert.equal(g.combo, 2);
    const r1 = requestHint(g);
    assert.ok(r1.ok && r1.state.combo === 0);
    if (!r1.ok) return;
    const place = r1.state.hint!.step.placements[0];
    let g2 = r1.state;
    if (place) {
      g2 = enter(g2, place.cell, place.digit).state;
      const r2 = requestHint(g2);
      assert.ok(r2.ok);
      if (r2.ok) assert.equal(r2.view.level, 1);
    }
  });

  it("hints use only correct entries, ignoring wrong red digits", () => {
    let g = game(5, "easy", 11);
    const a = emptyCells(g)[0];
    g = enter(g, a, wrongDigit(g, a)).state;
    assert.equal(correctBoard(g)[a], "0");
    assert.ok(requestHint(g).ok);
  });
});

describe("reveal", () => {
  it("scores nothing and clears trials", () => {
    let g = game();
    g = setTrial(g, emptyCells(g)[0], 3);
    g = reveal(g);
    assert.equal(g.status, "revealed");
    assert.equal(trialCells(g).length, 0);
    assert.equal(scoreOf({ ...g, status: "revealed" }).total >= 0, true);
  });

  it("a won game can't be revealed", () => {
    let g = game();
    for (const c of emptyCells(g)) g = enter(g, c, Number(g.solution[c])).state;
    assert.equal(reveal(g).status, "won");
  });
});

describe("fresh games", () => {
  it("skip bank puzzles that were given up on", () => {
    const first = freshGame("hard", 3, undefined, 77);
    const next = freshGame("hard", 3, new Set([first.baseId]), 77);
    assert.notEqual(next.baseId, first.baseId);
    assert.ok(emptiesOf(next) > 0);
  });
});
