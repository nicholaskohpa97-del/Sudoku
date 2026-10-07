"use client";

import { createStore } from "./store";
import { DEFAULT_LIVES, isValidLives } from "./scoring";

export interface Prefs {
  /** Lives chosen for new games; 0 = unlimited (practice). */
  lives: number;
  /** Vibrate on moves (phones). */
  haptics: boolean;
  showTimer: boolean;
  /** Tint the row, column and box of the selected cell. */
  highlightRelated: boolean;
  /** Tint every cell holding the selected digit. */
  highlightSame: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  lives: DEFAULT_LIVES,
  haptics: true,
  showTimer: true,
  highlightRelated: true,
  highlightSame: true,
};

export const PREFS_KEY = "sudoku.prefs.v1";
const store = createStore<Prefs>(PREFS_KEY, () => ({ ...DEFAULT_PREFS }), "sudoku-prefs");

export function loadPrefs(): Prefs {
  const p = store.load();
  return { ...p, lives: isValidLives(p.lives) ? p.lives : DEFAULT_LIVES };
}

export function savePrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...loadPrefs(), ...patch };
  store.save(next);
  return next;
}

/** The preferences, falling back to defaults during SSR and hydration. */
export function usePrefs(): Prefs {
  const p = store.use();
  return p ? { ...p, lives: isValidLives(p.lives) ? p.lives : DEFAULT_LIVES } : DEFAULT_PREFS;
}
