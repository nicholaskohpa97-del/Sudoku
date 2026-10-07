import { solve, type Puzzle } from "./engine";
import type { HistoryRecord } from "./history";

/** Rebuilds the exact puzzle of a past game so it can be played again. */
export function puzzleFromRecord(r: Pick<HistoryRecord, "puzzle" | "difficulty" | "seed" | "rating" | "parMs" | "baseId">): Puzzle | null {
  const solution = solve(r.puzzle);
  if (!solution) return null;
  return { puzzle: r.puzzle, solution, difficulty: r.difficulty, seed: r.seed, rating: r.rating, parMs: r.parMs, baseId: r.baseId };
}
