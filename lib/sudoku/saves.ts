"use client";

// In-progress solo games survive a refresh. One save per tier (and one for the
// daily puzzle), plus a pointer to the most recent for the hub's "Resume".
import type { GameState } from "./game";
import type { Difficulty } from "./engine";

const key = (kind: "classic" | "daily", difficulty?: Difficulty) => (kind === "daily" ? "sudoku.save.daily" : `sudoku.save.${difficulty}`);
const LAST_KEY = "sudoku.save.last";
export const DAILY_DONE_KEY = "sudoku.dailyDone.v1";

function read(k: string): GameState | null {
  try {
    const g = JSON.parse(localStorage.getItem(k) ?? "null") as GameState | null;
    return g && g.v === 2 ? g : null;
  } catch {
    return null;
  }
}

export function saveGame(g: GameState): void {
  try {
    localStorage.setItem(key(g.kind, g.difficulty), JSON.stringify(g));
    if (g.kind === "classic") localStorage.setItem(LAST_KEY, g.difficulty);
  } catch {
    // Ignore storage failures.
  }
}

export function loadGame(kind: "classic" | "daily", difficulty?: Difficulty): GameState | null {
  return read(key(kind, difficulty));
}

export function clearGame(kind: "classic" | "daily", difficulty?: Difficulty): void {
  try {
    localStorage.removeItem(key(kind, difficulty));
  } catch {
    // Ignore storage failures.
  }
}

/** The classic game most recently played, if it is still in progress. */
export function loadSavedGame(): GameState | null {
  try {
    const last = localStorage.getItem(LAST_KEY) as Difficulty | null;
    const g = last ? read(key("classic", last)) : null;
    return g && g.status === "playing" ? g : null;
  } catch {
    return null;
  }
}

/** Day key of the last daily puzzle solved on this device. */
export function loadDailyDone(): string | null {
  try {
    return localStorage.getItem(DAILY_DONE_KEY);
  } catch {
    return null;
  }
}

export function markDailyDone(day: string): void {
  try {
    localStorage.setItem(DAILY_DONE_KEY, day);
  } catch {
    // Ignore storage failures.
  }
}
