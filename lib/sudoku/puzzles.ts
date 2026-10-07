// Puzzle supply: draws a pre-rated puzzle from the bank and disguises it with
// a seeded, rating-preserving transform (digit relabelling, row/column
// permutations within bands and stacks, band/stack swaps, transpose). The same
// (difficulty, seed) always gives the same grid.
import { BANK } from "./bank";
import { createRng, isDifficulty, randomSeed, shuffle, solve, type Difficulty, type Puzzle } from "./engine";

interface Transform {
  digits: number[]; // old digit -> new digit (index 0 unused)
  rows: number[]; // new row -> old row
  cols: number[]; // new col -> old col
  transpose: boolean;
}

function permutation(rng: () => number): number[] {
  // Permute bands (or stacks), then the lines inside each.
  const bands = shuffle([0, 1, 2], rng);
  return bands.flatMap((b) => shuffle([0, 1, 2], rng).map((k) => b * 3 + k));
}

export function randomTransform(rng: () => number): Transform {
  return {
    digits: [0, ...shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng)],
    rows: permutation(rng),
    cols: permutation(rng),
    transpose: rng() < 0.5,
  };
}

export function applyTransform(grid: string, t: Transform): string {
  const out: string[] = new Array(81);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const [sr, sc] = [t.rows[r], t.cols[c]];
      const v = Number(grid[sr * 9 + sc]);
      const target = t.transpose ? c * 9 + r : r * 9 + c;
      out[target] = String(v === 0 ? 0 : t.digits[v]);
    }
  }
  return out.join("");
}

/** Which bank entry a `baseId` such as "hard:42" names. */
function parseBaseId(baseId: string): { difficulty: Difficulty; index: number } | null {
  const [tier, idx] = baseId.split(":");
  const index = Number(idx);
  if (!isDifficulty(tier) || !Number.isInteger(index) || index < 0 || index >= BANK[tier].length) return null;
  return { difficulty: tier, index };
}

/**
 * The puzzle that `(baseId, seed)` always produces: bank entry `baseId`
 * disguised by the transform seeded from `seed`. This is the puzzle's identity:
 * the same pair gives the same grid, rating and par everywhere, which lets the
 * server rebuild a posted puzzle instead of trusting the client's copy.
 */
export function puzzleFromBase(baseId: string, seed: number): Puzzle | null {
  const parsed = parseBaseId(baseId);
  if (!parsed) return null;
  const [base, rating, parMs] = BANK[parsed.difficulty][parsed.index];
  const puzzle = applyTransform(base, randomTransform(createRng((seed ^ 0x9e3779b9) >>> 0)));
  const solution = solve(puzzle);
  if (!solution) return null;
  return { puzzle, solution, difficulty: parsed.difficulty, seed, rating, parMs, baseId };
}

/**
 * A puzzle of the requested tier. Deterministic for a given seed. Bank
 * puzzles listed in `exclude` (by `baseId`) are skipped, so a player is
 * never dealt a disguised copy of one they gave up on.
 */
export function generatePuzzle(
  difficulty: Difficulty,
  seed: number = randomSeed(),
  exclude?: ReadonlySet<string>,
): Puzzle {
  const bank = BANK[difficulty];
  if (!bank.length) throw new Error(`The ${difficulty} puzzle bank is empty. Run scripts/build-bank.ts.`);
  const rng = createRng(seed);
  let index = Math.floor(rng() * bank.length);
  for (let tries = 0; exclude?.has(`${difficulty}:${index}`) && tries < bank.length; tries++) {
    index = (index + 1 + Math.floor(rng() * bank.length)) % bank.length;
  }
  const puzzle = puzzleFromBase(`${difficulty}:${index}`, seed);
  if (!puzzle) throw new Error("Bank puzzle has no solution");
  return puzzle;
}
