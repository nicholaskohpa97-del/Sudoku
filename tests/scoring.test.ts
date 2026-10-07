import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  basePoints,
  chainMultiplier,
  cellShare,
  comboMultiplier,
  isValidLives,
  LIVES_OPTIONS,
  scorePuzzle,
  timeFactor,
  UNLIMITED_LIVES,
  type ScoreInput,
} from "@/lib/sudoku/scoring";

/** A player who never breaks the combo gets the ladder's multiplier on each entry. */
function perfectComboWeight(empties: number): number {
  let w = 0;
  for (let c = 1; c <= empties; c++) w += cellShare(c);
  return w;
}

const baseInput = (over: Partial<ScoreInput> = {}): ScoreInput => ({
  rating: 4.4,
  parMs: 6 * 60_000,
  empties: 55,
  elapsedMs: 6 * 60_000,
  lives: 3,
  livesLost: 0,
  hintsUsed: 0,
  comboWeight: 55,
  ...over,
});

describe("scoring building blocks", () => {
  it("base points double every +1.5 rating", () => {
    assert.equal(basePoints(1), 100);
    assert.equal(basePoints(2.5), 200);
    assert.equal(basePoints(4), 400);
    assert.equal(basePoints(7), 1600);
  });

  it("combo ladder is by count, not time", () => {
    assert.deepEqual([1, 4, 5, 9, 10, 19, 20, 34, 35, 60].map(comboMultiplier), [1, 1, 1.5, 1.5, 2, 2, 3, 3, 4, 4]);
  });

  it("time factor is clamped to ×0.5–×1.5", () => {
    assert.equal(timeFactor(60_000, 600_000), 1.5);
    assert.equal(timeFactor(600_000, 600_000), 1);
    assert.equal(timeFactor(6_000_000, 600_000), 0.5);
  });

  it("chain multiplier grows and is capped", () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 99].map(chainMultiplier), [1, 1.1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.5]);
  });

  it("validates the lives menu", () => {
    for (const n of LIVES_OPTIONS) assert.ok(isValidLives(n));
    assert.ok(isValidLives(UNLIMITED_LIVES));
    assert.ok(!isValidLives(4));
  });
});

describe("incentives hold (simulated players)", () => {
  const score = (over: Partial<ScoreInput>) => scorePuzzle(baseInput(over)).total;

  it("harder puzzles score more at equal skill", () => {
    const tiers = [1.3, 2.4, 3.3, 4.4, 6.5, 7.9];
    const scores = tiers.map((rating, k) => score({ rating, parMs: (3 + k * 3) * 60_000, elapsedMs: (3 + k * 3) * 60_000 }));
    assert.deepEqual([...scores].sort((a, b) => a - b), scores);
  });

  it("faster is better", () => {
    assert.ok(score({ elapsedMs: 3 * 60_000 }) > score({ elapsedMs: 6 * 60_000 }));
    assert.ok(score({ elapsedMs: 6 * 60_000 }) > score({ elapsedMs: 20 * 60_000 }));
  });

  it("using fewer lives is better", () => {
    const s = [0, 1, 2].map((livesLost) => score({ livesLost, lives: 5 }));
    assert.ok(s[0] > s[1] && s[1] > s[2]);
  });

  it("choosing fewer lives is better, even though it's riskier", () => {
    const s = LIVES_OPTIONS.map((lives) => score({ lives }));
    for (let i = 1; i < s.length; i++) assert.ok(s[i - 1] > s[i], `${LIVES_OPTIONS[i - 1]} vs ${LIVES_OPTIONS[i]}`);
  });

  it("an unbroken combo beats a broken one", () => {
    const perfect = score({ comboWeight: perfectComboWeight(55) });
    const broken = score({ comboWeight: 55 + 10 });
    assert.ok(perfect > broken);
  });

  it("no hints beats hints, and each hint costs", () => {
    const s = [0, 1, 2, 3].map((hintsUsed) => score({ hintsUsed }));
    for (let i = 1; i < s.length; i++) assert.ok(s[i - 1] > s[i]);
  });

  it("a flawless run earns a bonus a one-life-lost run does not", () => {
    assert.ok(scorePuzzle(baseInput()).flawlessBonus > 0);
    assert.equal(scorePuzzle(baseInput({ livesLost: 1 })).flawlessBonus, 0);
    assert.equal(scorePuzzle(baseInput({ hintsUsed: 1 })).flawlessBonus, 0);
  });

  it("practice (unlimited lives) scores nothing", () => {
    assert.equal(scorePuzzle(baseInput({ lives: UNLIMITED_LIVES })).total, 0);
  });

  it("losing a life on a 1-life pick is impossible to score, but 1 life flawless tops 3 lives flawless", () => {
    assert.ok(score({ lives: 1 }) > score({ lives: 3 }));
  });

  it("a harder puzzle with a mistake still outscores an easier flawless one two tiers down", () => {
    assert.ok(score({ rating: 7.9, livesLost: 2, lives: 5 }) > score({ rating: 3.3 }));
  });
});
