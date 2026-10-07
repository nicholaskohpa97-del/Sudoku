// Offline puzzle generation for the bank (scripts/build-bank.ts). Not used
// at runtime: the app draws puzzles from the pre-rated bank instead, so a
// rare Master puzzle never costs the player a loading spinner.
import {
  countSolutions,
  createRng,
  DIFFICULTY_CONFIG,
  randomSolution,
  shuffle,
  type Difficulty,
} from "./engine";
import { ratePuzzle, type Rating } from "./solver";

export interface Generated {
  puzzle: string;
  solution: string;
  rating: Rating;
}

const ALL_CELLS = Array.from({ length: 81 }, (_, k) => k);

/**
 * Removes clues in random order while the solution stays unique. With
 * `maxWeight`, a removal is also refused if it would need a technique above
 * that weight (so the carve stops at the top of the requested band). With
 * `minClues`, it never goes below that many clues.
 */
export function carve(
  solution: string,
  rng: () => number,
  options: { maxWeight?: number; minClues?: number } = {},
): string {
  const cells = Array.from(solution);
  let clues = 81;
  const floor = options.minClues ?? 0;
  for (const i of shuffle(ALL_CELLS.slice(), rng)) {
    if (clues <= floor) break;
    const saved = cells[i];
    cells[i] = "0";
    const grid = cells.join("");
    const ok =
      countSolutions(grid, 2) === 1 &&
      (options.maxWeight === undefined || ratePuzzle(grid, { maxWeight: options.maxWeight }) !== null);
    if (ok) clues--;
    else cells[i] = saved;
  }
  return cells.join("");
}

function inBand(r: Rating, tier: Difficulty): boolean {
  const { minRating, maxRating } = DIFFICULTY_CONFIG[tier];
  return r.tier === tier && r.ceiling >= minRating && r.ceiling < maxRating && r.logical;
}

/** One attempt at a puzzle of `tier`; null if it didn't land in the band. */
export function attempt(tier: Difficulty, rng: () => number): Generated | null {
  const solution = randomSolution(rng);
  let puzzle: string;
  switch (tier) {
    case "beginner":
      // Hidden singles only, and plenty of clues.
      puzzle = carve(solution, rng, { maxWeight: 1.5, minClues: 40 + Math.floor(rng() * 6) });
      break;
    case "easy":
      puzzle = carve(solution, rng, { maxWeight: 2.8, minClues: 32 + Math.floor(rng() * 8) });
      break;
    case "medium":
      puzzle = carve(solution, rng, { maxWeight: 3.9, minClues: 27 + Math.floor(rng() * 6) });
      break;
    default:
      puzzle = carve(solution, rng);
  }
  const rating = ratePuzzle(puzzle);
  if (!rating || !inBand(rating, tier)) return null;
  return { puzzle, solution, rating };
}

/** Keeps trying with a seeded RNG until a puzzle of `tier` turns up. */
export function generateForTier(tier: Difficulty, seed: number, maxAttempts = 5000): Generated | null {
  const rng = createRng(seed);
  for (let n = 0; n < maxAttempts; n++) {
    const g = attempt(tier, rng);
    if (g) return g;
  }
  return null;
}
