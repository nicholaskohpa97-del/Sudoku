// Objective difficulty rating. See docs/difficulty.md for the full criteria.
import { DIFFICULTIES, DIFFICULTY_CONFIG, tierForCeiling, tierForEmpties, type Difficulty } from "../engine";
import { applyStep, isSolved, stateFromGrid } from "./grid";
import { nextStep, type NextStepOptions } from "./ladder";
import type { Step, TechniqueId } from "./types";

export interface Rating {
  tier: Difficulty;
  /** Difficulty Rating, 1.0–10.0: hardest technique weight plus a capped workload fraction, kept inside the tier. */
  dr: number;
  /** Weight of the hardest technique the puzzle forces. */
  ceiling: number;
  hardest: TechniqueId;
  steps: number;
  /** Empty cells on the starting grid (the scan load). */
  empties: number;
  /** Steps that needed more than a single (a stall in the easy flow). */
  stalls: number;
  /** Σ max(0, weight − 1) over all steps. */
  workload: number;
  /** Singles available on the untouched grid. */
  openness: number;
  /** How often each technique was needed. */
  counts: Partial<Record<TechniqueId, number>>;
  /** Par solve time for a human (ms), from the step weights. */
  parMs: number;
  /** Whether logic alone solved it (false means a guess was unavoidable). */
  logical: boolean;
}

/** Workload fraction: saturates smoothly towards 0.9. */
const WORKLOAD_SCALE = 80;

/**
 * Seconds a human needs for one step of weight `w`: a couple of seconds for a
 * single, about 10 s for a pair, 20 s for a wing, a minute for a short chain,
 * and minutes for forcing chains (capped, since past that players start
 * pencil-testing instead).
 */
export function stepSeconds(w: number): number {
  return Math.min(180, 3 + 1.5 * Math.exp(0.8 * Math.max(0, w - 1)));
}

export function ratingOfSteps(steps: Step[], openness: number, solved: boolean, empties: number): Rating {
  let ceiling = 1;
  let hardest: TechniqueId = "full-house";
  let workload = 0;
  let stalls = 0;
  let seconds = 30;
  const counts: Partial<Record<TechniqueId, number>> = {};
  for (const st of steps) {
    if (st.weight > ceiling) {
      ceiling = st.weight;
      hardest = st.technique;
    }
    workload += Math.max(0, st.weight - 1);
    if (st.weight >= 2.6) stalls++;
    seconds += stepSeconds(st.weight);
    counts[st.technique] = (counts[st.technique] ?? 0) + 1;
  }
  // Tier = the harder of what the techniques demand and what the scan load demands.
  const byTechnique = tierForCeiling(ceiling);
  const byLoad = tierForEmpties(empties);
  const tier = DIFFICULTIES[Math.max(DIFFICULTIES.indexOf(byTechnique), DIFFICULTIES.indexOf(byLoad))];
  const { minRating, maxRating } = DIFFICULTY_CONFIG[tier];
  const fraction = 0.9 * (1 - Math.exp(-workload / WORKLOAD_SCALE));
  const dr = Math.round(Math.min(Math.max(ceiling, minRating) + fraction, maxRating - 0.01, 10) * 100) / 100;
  return {
    tier,
    dr,
    ceiling,
    hardest,
    steps: steps.length,
    empties,
    stalls,
    workload: Math.round(workload * 10) / 10,
    openness,
    counts,
    parMs: Math.round(seconds) * 1000,
    logical: solved && !counts["trial-and-error"],
  };
}

/** Number of placements available straight away on the untouched grid. */
export function opennessOf(grid: string): number {
  const s = stateFromGrid(grid);
  let n = 0;
  for (let i = 0; i < 81; i++) {
    if (s.cells[i] !== 0) continue;
    const m = s.cand[i];
    if ((m & (m - 1)) === 0) n++;
  }
  return n;
}

/**
 * Rates a grid by solving it with the cheapest-first technique ladder.
 * With `options.maxWeight` it stops as soon as a harder step is needed and
 * returns null, which makes it cheap to reject puzzles that are too hard.
 */
export function ratePuzzle(grid: string, options: NextStepOptions = {}): Rating | null {
  const s = stateFromGrid(grid);
  const empties = s.cells.reduce((n, v) => n + (v === 0 ? 1 : 0), 0);
  const steps: Step[] = [];
  while (!isSolved(s)) {
    const step = nextStep(s, options);
    if (!step) return options.maxWeight !== undefined ? null : ratingOfSteps(steps, opennessOf(grid), false, empties);
    steps.push(step);
    applyStep(s, step);
    if (steps.length > 400) return null;
  }
  return ratingOfSteps(steps, opennessOf(grid), true, empties);
}
