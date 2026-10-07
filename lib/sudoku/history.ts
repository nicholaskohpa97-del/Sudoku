"use client";

// Every solo game played on this device, newest first. Backs the History
// screen, the "never replay a revealed puzzle" rule and the profile.
import type { GameKind } from "./game";
import type { Difficulty } from "./engine";
import { createStore } from "./store";
import type { Evidence, ScanStyle } from "./strategy";
import type { TechniqueId } from "./solver";

export type GameResult = "won" | "lost" | "revealed";

export interface HistoryRecord {
  id: string;
  /** Finish time (epoch ms). */
  at: number;
  kind: GameKind;
  difficulty: Difficulty;
  rating: number;
  seed: number;
  puzzle: string;
  baseId: string;
  daily?: string;
  /** Ascent: which level of the run this was (1 = Beginner). */
  level?: number;
  /** The leaderboard entry this game was posted as. */
  posted?: string;
  result: GameResult;
  elapsedMs: number;
  parMs: number;
  lives: number;
  livesLost: number;
  hints: number;
  maxCombo: number;
  /** Puzzle score before the chain multiplier. */
  score: number;
  chain: { count: number; multiplier: number; awarded: number } | null;
  strategy?: {
    hardest: TechniqueId | null;
    techniques: { technique: TechniqueId; evidence: Evidence }[];
    guesses: number;
    style: ScanStyle;
  };
}

interface HistoryState {
  records: HistoryRecord[];
}

const MAX_RECORDS = 400;
const store = createStore<HistoryState>("sudoku.history.v1", () => ({ records: [] }), "sudoku-history");

export const useHistory = store.use;
export const loadHistory = () => store.load().records;

/** Adds or replaces (by id) a record. */
export function saveRecord(record: HistoryRecord): void {
  const records = store.load().records.filter((r) => r.id !== record.id);
  store.save({ records: [record, ...records].slice(0, MAX_RECORDS) });
}

export function updateRecord(id: string, patch: Partial<HistoryRecord>): void {
  const state = store.load();
  store.save({ records: state.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
}

/** Bank puzzles the player has given up on: never dealt again. */
export function revealedBases(): Set<string> {
  return new Set(loadHistory().filter((r) => r.result === "revealed").map((r) => r.baseId));
}

/** True if this exact grid was revealed before, so it can't be replayed. */
export function isRevealedPuzzle(puzzle: string, daily?: string): boolean {
  return loadHistory().some((r) => r.result === "revealed" && (r.puzzle === puzzle || (!!daily && r.daily === daily)));
}
