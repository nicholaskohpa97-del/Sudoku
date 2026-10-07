"use client";

import { createStore } from "./store";
import { DEFAULT_LIVES, isValidLives } from "./scoring";

export interface Prefs {
  /** Lives chosen for new games; 0 = unlimited (practice). */
  lives: number;
}

const store = createStore<Prefs>("sudoku.prefs.v1", () => ({ lives: DEFAULT_LIVES }), "sudoku-prefs");

export function loadPrefs(): Prefs {
  const p = store.load();
  return { lives: isValidLives(p.lives) ? p.lives : DEFAULT_LIVES };
}

export function savePrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...loadPrefs(), ...patch };
  store.save(next);
  return next;
}

export const usePrefs = store.use;
