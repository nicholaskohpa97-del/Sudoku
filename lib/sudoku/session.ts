"use client";

// The clear chain: consecutive puzzles solved in one session, without using a
// hint, leaving the app or switching to another app. Not time-based. A page
// refresh does not break it; closing and reopening the app does.
import { chainMultiplier } from "./scoring";
import { createStore } from "./store";

export interface ChainState {
  /** Consecutive clears so far in this session. */
  count: number;
  best: number;
  /** Points banked this session (puzzle score × chain multiplier). */
  points: number;
  /** Why the last chain ended, shown once. */
  lastBreak: string | null;
}

const store = createStore<ChainState>("sudoku.chain.v1", () => ({ count: 0, best: 0, points: 0, lastBreak: null }), "sudoku-chain");

export const loadChain = store.load;
export const useChain = store.use;

export const AWAY_EVENT = "sudoku-away";
export const CHAIN_BREAK_EVENT = "sudoku-chain-break";

export type BreakReason = "hint" | "away" | "lost" | "left";

const MESSAGES: Record<BreakReason, string> = {
  hint: "You used a hint",
  away: "You switched away from the app",
  lost: "You ran out of lives",
  left: "You left the app",
};

export function breakChain(reason: BreakReason): void {
  const chain = store.load();
  if (chain.count === 0 && reason !== "away") return;
  store.save({ ...chain, count: 0, lastBreak: chain.count > 0 ? MESSAGES[reason] : null });
  if (chain.count > 0) window.dispatchEvent(new CustomEvent(CHAIN_BREAK_EVENT, { detail: { reason: MESSAGES[reason], was: chain.count } }));
}

export interface ClearResult {
  count: number;
  multiplier: number;
  /** Points banked for this clear after the multiplier. */
  awarded: number;
}

/** Registers a won, un-revealed puzzle and banks its points. */
export function recordClear(puzzleScore: number): ClearResult {
  const chain = store.load();
  const count = chain.count + 1;
  const multiplier = chainMultiplier(count);
  const awarded = Math.round(puzzleScore * multiplier);
  store.save({ count, best: Math.max(chain.best, count), points: chain.points + awarded, lastBreak: null });
  return { count, multiplier, awarded };
}

/** Starts a fresh session (the app was opened anew). */
export function startNewSession(): void {
  const chain = store.load();
  store.save({ count: 0, best: chain.best, points: 0, lastBreak: chain.count > 0 ? MESSAGES.left : null });
}

/** True if this document load is a refresh (which must not break the chain). */
export function isReload(): boolean {
  const nav = performance.getEntriesByType?.("navigation")?.[0] as PerformanceNavigationTiming | undefined;
  return nav?.type === "reload";
}
