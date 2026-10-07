"use client";

import type { AscentRun } from "./ascent";
import { createStore } from "./store";

export interface AscentState {
  /** The run in progress, or the one that just ended (until a new one starts). */
  run: AscentRun | null;
  /** Best finished run by points. */
  best: { points: number; cleared: number; topCleared: number; at: number } | null;
}

const store = createStore<AscentState>("sudoku.ascent.v1", () => ({ run: null, best: null }), "sudoku-ascent");

export const useAscent = store.use;
export const loadAscent = store.load;

export function saveRun(run: AscentRun | null): void {
  const s = store.load();
  let best = s.best;
  if (run?.status === "over" && (!best || run.points > best.points)) {
    best = { points: run.points, cleared: run.cleared, topCleared: run.topCleared, at: Date.now() };
  }
  store.save({ run, best });
}
