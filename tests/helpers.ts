import type { State } from "@/lib/sudoku/solver";

export const isSolvedState = (s: State): boolean => s.cells.every((v) => v !== 0);
