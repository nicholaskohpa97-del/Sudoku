// Pure Sudoku engine: seeded generation, uniqueness-checked solving and a
// human-style grader. No DOM or Node APIs, so it runs on client and server.

export type Difficulty = "beginner" | "easy" | "medium" | "hard" | "expert" | "master";

/** Ordered easiest to hardest. */
export const DIFFICULTIES: Difficulty[] = ["beginner", "easy", "medium", "hard", "expert", "master"];

export interface DifficultyConfig {
  label: string;
  blurb: string;
  /**
   * Rating band: a puzzle belongs to the tier whose [minRating, maxRating)
   * contains the weight of the hardest technique it forces (see
   * `lib/sudoku/solver/rate.ts` and docs/difficulty.md).
   */
  minRating: number;
  maxRating: number;
  /** What the player needs, in plain words. */
  needs: string;
}

export const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  beginner: {
    label: "Beginner",
    blurb: "Just scan for where each digit fits",
    minRating: 1,
    maxRating: 2,
    needs: "Hidden singles only",
  },
  easy: {
    label: "Easy",
    blurb: "Naked singles and pointing pairs",
    minRating: 2,
    maxRating: 3,
    needs: "Naked singles, pointing and claiming",
  },
  medium: {
    label: "Medium",
    blurb: "Pairs, triples and your first X-Wing",
    minRating: 3,
    maxRating: 4,
    needs: "Naked/hidden pairs, naked triples, X-Wing, Swordfish",
  },
  hard: {
    label: "Hard",
    blurb: "Wings, kites and unique rectangles",
    minRating: 4,
    maxRating: 5.5,
    needs: "Hidden triples, Skyscraper, Kite, XY/XYZ/W-Wing, Unique Rectangles, coloring, quads, Jellyfish",
  },
  expert: {
    label: "Expert",
    blurb: "Long chains of cause and effect",
    minRating: 5.5,
    maxRating: 7,
    needs: "X-chains, XY-chains and alternating inference chains",
  },
  master: {
    label: "Master",
    blurb: "Forcing chains. Brace yourself",
    minRating: 7,
    maxRating: 10.01,
    needs: "Forcing chains, Nishio and trial-and-error depth",
  },
};

/**
 * Scan load: how many empty cells a player must fill. Puzzles that need only
 * singles are still a lot of work with few clues, so they are raised to Easy
 * above `BEGINNER_MAX_EMPTIES` empty cells and to Medium above `EASY_MAX_EMPTIES`.
 */
export const BEGINNER_MAX_EMPTIES = 41;
export const EASY_MAX_EMPTIES = 49;

/** Lowest tier that the scan load alone allows. */
export function tierForEmpties(empties: number): Difficulty {
  if (empties <= BEGINNER_MAX_EMPTIES) return "beginner";
  if (empties <= EASY_MAX_EMPTIES) return "easy";
  return "medium";
}

/** The tier a hardest-technique weight falls into. */
export function tierForCeiling(ceiling: number): Difficulty {
  for (let i = DIFFICULTIES.length - 1; i >= 0; i--) {
    if (ceiling >= DIFFICULTY_CONFIG[DIFFICULTIES[i]].minRating) return DIFFICULTIES[i];
  }
  return "beginner";
}

export const MAX_MISTAKES = 3;

/** 81-char string, row-major, "0" for an empty cell. */
export type Grid = string;

export interface Puzzle {
  puzzle: Grid;
  solution: Grid;
  difficulty: Difficulty;
  seed: number;
  /** Difficulty Rating (1–10) of this exact grid; see docs/difficulty.md. */
  rating: number;
}

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === "string" && (DIFFICULTIES as string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32) so a seed always reproduces the same puzzle.

export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

// ---------------------------------------------------------------------------
// Geometry

export const rowOf = (i: number) => Math.floor(i / 9);
export const colOf = (i: number) => i % 9;
export const boxOf = (i: number) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

/** For each cell, the 20 other cells sharing its row, column or box. */
export const PEERS: number[][] = Array.from({ length: 81 }, (_, i) => {
  const peers = new Set<number>();
  for (let j = 0; j < 81; j++) {
    if (j !== i && (rowOf(j) === rowOf(i) || colOf(j) === colOf(i) || boxOf(j) === boxOf(i))) {
      peers.add(j);
    }
  }
  return [...peers];
});

/** The 27 units (9 rows, 9 cols, 9 boxes) as lists of cell indices. */
export const UNITS: number[][] = [
  ...Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, b) =>
    Array.from({ length: 9 }, (_, k) => (Math.floor(b / 3) * 3 + Math.floor(k / 3)) * 9 + (b % 3) * 3 + (k % 3)),
  ),
];

export const ALL = 0x3fe; // bits 1..9
export const bit = (d: number) => 1 << d;
export const popcount = (m: number) => {
  let n = 0;
  while (m) {
    m &= m - 1;
    n++;
  }
  return n;
};
export const digitsOf = (m: number) => {
  const out: number[] = [];
  for (let d = 1; d <= 9; d++) if (m & bit(d)) out.push(d);
  return out;
};

function toCells(grid: Grid): number[] {
  return Array.from(grid, (ch) => ch.charCodeAt(0) - 48);
}

function candidatesFor(cells: number[], i: number): number {
  let used = 0;
  for (const p of PEERS[i]) used |= bit(cells[p]);
  return ALL & ~used;
}

// ---------------------------------------------------------------------------
// Backtracking solver (MRV heuristic). Counts up to `limit` solutions.

function search(cells: number[], limit: number, rng: (() => number) | null, found: number[][]): void {
  if (found.length >= limit) return;
  let best = -1;
  let bestMask = 0;
  let bestCount = 10;
  for (let i = 0; i < 81; i++) {
    if (cells[i] !== 0) continue;
    const mask = candidatesFor(cells, i);
    const count = popcount(mask);
    if (count === 0) return;
    if (count < bestCount) {
      best = i;
      bestMask = mask;
      bestCount = count;
      if (count === 1) break;
    }
  }
  if (best === -1) {
    found.push(cells.slice());
    return;
  }
  const options = digitsOf(bestMask);
  if (rng) shuffle(options, rng);
  for (const d of options) {
    cells[best] = d;
    search(cells, limit, rng, found);
    if (found.length >= limit) break;
  }
  cells[best] = 0;
}

export function countSolutions(grid: Grid, limit = 2): number {
  const found: number[][] = [];
  search(toCells(grid), limit, null, found);
  return found.length;
}

export function solve(grid: Grid): Grid | null {
  const found: number[][] = [];
  search(toCells(grid), 1, null, found);
  return found.length ? found[0].join("") : null;
}

/** A random completed grid (used by the offline bank builder). */
export function randomSolution(rng: () => number): Grid {
  const found: number[][] = [];
  search(new Array(81).fill(0), 1, rng, found);
  return found[0].join("");
}

// ---------------------------------------------------------------------------
// Human-style grader: can the puzzle be finished with naked + hidden singles?

export function solvableWithSingles(grid: Grid): boolean {
  const cells = toCells(grid);
  let progress = true;
  while (progress) {
    progress = false;
    for (let i = 0; i < 81; i++) {
      if (cells[i] !== 0) continue;
      const mask = candidatesFor(cells, i);
      if (mask === 0) return false;
      if (popcount(mask) === 1) {
        cells[i] = digitsOf(mask)[0];
        progress = true;
      }
    }
    for (const unit of UNITS) {
      for (let d = 1; d <= 9; d++) {
        if (unit.some((i) => cells[i] === d)) continue;
        const spots = unit.filter((i) => cells[i] === 0 && candidatesFor(cells, i) & bit(d));
        if (spots.length === 1) {
          cells[spots[0]] = d;
          progress = true;
        }
      }
    }
  }
  return cells.every((v) => v !== 0);
}

// ---------------------------------------------------------------------------
// Seeds and clues. Puzzle generation lives in `puzzles.ts` (bank-driven) and
// `generate.ts` (offline bank builder).

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

export function countClues(grid: Grid): number {
  let n = 0;
  for (const ch of grid) if (ch !== "0") n++;
  return n;
}

// ---------------------------------------------------------------------------
// Unit completion (drives the row/column/box celebration animation)

export type UnitKind = "row" | "col" | "box";

export interface CompletedUnit {
  kind: UnitKind;
  /** 0–8: which row, column or box. */
  index: number;
  cells: number[];
}

/**
 * Which of cell `index`'s row, column and box are now completely filled.
 * `board` must contain only correct digits (givens plus correct entries)
 * with "0" or 0 elsewhere, which is how both solo and room boards are kept.
 */
export function completedUnits(board: string | number[], index: number): CompletedUnit[] {
  const filled = (i: number) => {
    const v = board[i];
    return v !== undefined && v !== 0 && v !== "0";
  };
  if (!filled(index)) return [];
  const candidates: CompletedUnit[] = [
    { kind: "row", index: rowOf(index), cells: UNITS[rowOf(index)] },
    { kind: "col", index: colOf(index), cells: UNITS[9 + colOf(index)] },
    { kind: "box", index: boxOf(index), cells: UNITS[18 + boxOf(index)] },
  ];
  return candidates.filter((u) => u.cells.every(filled));
}
