// Pure Sudoku engine: seeded generation, uniqueness-checked solving and a
// human-style grader. No DOM or Node APIs, so it runs on client and server.

export type Difficulty = "easy" | "medium" | "hard" | "expert";

export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "expert"];

export const DIFFICULTY_CONFIG: Record<
  Difficulty,
  { label: string; clues: number; singlesOnly: boolean; blurb: string }
> = {
  easy: { label: "Easy", clues: 38, singlesOnly: true, blurb: "Relaxed warm-up" },
  medium: { label: "Medium", clues: 32, singlesOnly: true, blurb: "Needs hidden singles" },
  hard: { label: "Hard", clues: 27, singlesOnly: false, blurb: "Candidate work required" },
  expert: { label: "Expert", clues: 23, singlesOnly: false, blurb: "Few clues, deep logic" },
};

export const MAX_MISTAKES = 3;

/** 81-char string, row-major, "0" for an empty cell. */
export type Grid = string;

export interface Puzzle {
  puzzle: Grid;
  solution: Grid;
  difficulty: Difficulty;
  seed: number;
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

function shuffle<T>(items: T[], rng: () => number): T[] {
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
const UNITS: number[][] = [
  ...Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, b) =>
    Array.from({ length: 9 }, (_, k) => (Math.floor(b / 3) * 3 + Math.floor(k / 3)) * 9 + (b % 3) * 3 + (k % 3)),
  ),
];

const ALL = 0x3fe; // bits 1..9
const bit = (d: number) => 1 << d;
const popcount = (m: number) => {
  let n = 0;
  while (m) {
    m &= m - 1;
    n++;
  }
  return n;
};
const digitsOf = (m: number) => {
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
// Generation

function generateSolved(rng: () => number): number[] {
  const found: number[][] = [];
  search(new Array(81).fill(0), 1, rng, found);
  return found[0];
}

function carve(solution: number[], targetClues: number, rng: () => number): number[] {
  const cells = solution.slice();
  // Remove cells in 180°-symmetric pairs for a classic look.
  const order = shuffle(
    Array.from({ length: 41 }, (_, i) => i),
    rng,
  );
  let clues = 81;
  for (const i of order) {
    if (clues <= targetClues) break;
    const j = 80 - i;
    const saved = [cells[i], cells[j]];
    cells[i] = 0;
    cells[j] = 0;
    const removed = i === j ? 1 : 2;
    if (countSolutions(cells.join(""), 2) === 1) {
      clues -= removed;
    } else {
      cells[i] = saved[0];
      cells[j] = saved[1];
    }
  }
  // Symmetric removal can plateau above the target; finish with single cells.
  for (const i of shuffle(Array.from({ length: 81 }, (_, k) => k), rng)) {
    if (clues <= targetClues) break;
    if (cells[i] === 0) continue;
    const saved = cells[i];
    cells[i] = 0;
    if (countSolutions(cells.join(""), 2) === 1) clues--;
    else cells[i] = saved;
  }
  return cells;
}

/**
 * Generate a puzzle with a unique solution. Easy/medium puzzles are
 * guaranteed to be solvable with singles only (no guessing); hard/expert
 * prefer puzzles that need more advanced candidate techniques.
 */
export function generatePuzzle(difficulty: Difficulty, seed: number = randomSeed()): Puzzle {
  const config = DIFFICULTY_CONFIG[difficulty];
  const rng = createRng(seed);
  let fallback: { puzzle: number[]; solution: number[] } | null = null;

  for (let attempt = 0; attempt < 12; attempt++) {
    const solution = generateSolved(rng);
    const puzzle = carve(solution, config.clues, rng);
    const grid = puzzle.join("");
    const singles = solvableWithSingles(grid);
    if (config.singlesOnly ? singles : !singles) {
      return { puzzle: grid, solution: solution.join(""), difficulty, seed };
    }
    if (!fallback) fallback = { puzzle, solution };
  }
  // Extremely unlikely; still a valid unique puzzle.
  return { puzzle: fallback!.puzzle.join(""), solution: fallback!.solution.join(""), difficulty, seed };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

export function countClues(grid: Grid): number {
  let n = 0;
  for (const ch of grid) if (ch !== "0") n++;
  return n;
}
