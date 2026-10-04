import type { Difficulty } from "./engine";

/** Points for completing a puzzle, by difficulty. */
export const BASE_POINTS: Record<Difficulty, number> = {
  easy: 10,
  medium: 20,
  hard: 30,
  expert: 40,
};

/** Extra share of base points for podium finishes (1st, 2nd, 3rd). */
export const PODIUM_BONUS = [0.5, 0.25, 0.1];
export const FLAWLESS_BONUS = 5;
export const PARTICIPATION_POINTS = 2;

export interface MatchOutcome {
  completed: boolean;
  /** 1-based finishing position among completers; null if not completed. */
  place: number | null;
  mistakes: number;
}

/**
 * Tournament points for one player in one league match:
 * - Completed: base points by difficulty, plus a podium bonus
 *   (+50% / +25% / +10% of base), plus +5 for a flawless (0-mistake) solve.
 * - Not completed (3 mistakes or out of time): participation points.
 */
export function scoreMatch(difficulty: Difficulty, outcome: MatchOutcome): number {
  if (!outcome.completed || outcome.place === null) return PARTICIPATION_POINTS;
  const base = BASE_POINTS[difficulty];
  const podium = PODIUM_BONUS[outcome.place - 1] ?? 0;
  const flawless = outcome.mistakes === 0 ? FLAWLESS_BONUS : 0;
  return Math.round(base * (1 + podium)) + flawless;
}

/** Tournament months follow this time zone (override with TOURNAMENT_TZ). */
export const DEFAULT_TOURNAMENT_TZ = "Asia/Singapore";

/** "YYYY-MM" for the given instant in the given time zone. */
export function monthKey(date: Date | number, timeZone: string = DEFAULT_TOURNAMENT_TZ): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(
    new Date(date),
  );
  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  return `${year}-${month}`;
}

export function isMonthKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function formatMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-SG", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
