"use client";

import type { Difficulty } from "./engine";

export interface SoloStats {
  played: number;
  won: number;
  bestMs: number | null;
}

const STATS_KEY = "sudoku.stats.v1";

export function loadStats(): Partial<Record<Difficulty, SoloStats>> {
  try {
    return JSON.parse(localStorage.getItem(STATS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function recordSoloResult(difficulty: Difficulty, won: boolean, elapsedMs: number): void {
  const stats = loadStats();
  const s = stats[difficulty] ?? { played: 0, won: 0, bestMs: null };
  s.played += 1;
  if (won) {
    s.won += 1;
    s.bestMs = s.bestMs === null ? elapsedMs : Math.min(s.bestMs, elapsedMs);
  }
  stats[difficulty] = s;
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // Ignore storage failures.
  }
}
