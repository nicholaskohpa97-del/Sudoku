// Ascent: the increasing-difficulty mode. A run starts at Beginner and climbs
// one tier per clear (staying at Master once there). You choose your lives
// once, and they are a single pool for the whole run with no refills. The run
// ends when the pool is empty. Showing a solution keeps the run going at the
// same level with a brand-new puzzle.
import { DIFFICULTIES, type Difficulty } from "./engine";

export interface AscentRun {
  id: string;
  /** Lives chosen for the whole run. */
  chosen: number;
  remaining: number;
  /** Index into DIFFICULTIES of the next puzzle. */
  level: number;
  cleared: number;
  /** Highest tier index cleared so far, or -1. */
  topCleared: number;
  /** Points banked in this run (after the chain multiplier). */
  points: number;
  startedAt: number;
  status: "active" | "over";
}

export const MAX_LEVEL = DIFFICULTIES.length - 1;

export function newRun(chosen: number, now = Date.now()): AscentRun {
  return {
    id: `ascent-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    chosen,
    remaining: chosen,
    level: 0,
    cleared: 0,
    topCleared: -1,
    points: 0,
    startedAt: now,
    status: "active",
  };
}

export const tierOfRun = (run: AscentRun): Difficulty => DIFFICULTIES[Math.min(run.level, MAX_LEVEL)];

export type PuzzleEnd =
  | { kind: "won"; livesLost: number; points: number }
  | { kind: "revealed"; livesLost: number }
  | { kind: "lost" };

/** The run after a puzzle ends. */
export function afterPuzzle(run: AscentRun, end: PuzzleEnd): AscentRun {
  if (end.kind === "lost") return { ...run, remaining: 0, status: "over" };
  const remaining = Math.max(1, run.remaining - end.livesLost);
  if (end.kind === "revealed") return { ...run, remaining };
  return {
    ...run,
    remaining,
    level: Math.min(run.level + 1, MAX_LEVEL),
    cleared: run.cleared + 1,
    topCleared: Math.max(run.topCleared, run.level),
    points: run.points + end.points,
  };
}
