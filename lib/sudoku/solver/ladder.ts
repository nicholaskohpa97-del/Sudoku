// The technique ladder: always apply the cheapest technique that makes progress.
import { applyStep, isSolved, stateFromGrid, type State } from "./grid";
import type { Step } from "./types";
import { claiming, fullHouse, hiddenSingleBox, hiddenSingleLine, nakedSingle, pointing } from "./techniques/basic";
import { chainStep } from "./techniques/chains";
import { fish } from "./techniques/fish";
import { cellForcing, nishio, regionForcing, trialAndError } from "./techniques/forcing";
import { hiddenSubset, nakedSubset } from "./techniques/subsets";
import { simpleColoring, turbot } from "./techniques/singleDigit";
import { uniqueRectangle } from "./techniques/uniqueness";
import { wWing, xyWing, xyzWing } from "./techniques/wings";

interface Rung {
  /** Lowest weight this rung can produce; the ladder is sorted by it. */
  weight: number;
  find: (s: State) => Step | null;
}

export const LADDER: Rung[] = [
  { weight: 1.0, find: fullHouse },
  { weight: 1.2, find: hiddenSingleBox },
  { weight: 1.5, find: hiddenSingleLine },
  { weight: 2.3, find: nakedSingle },
  { weight: 2.6, find: pointing },
  { weight: 2.8, find: claiming },
  { weight: 3.0, find: (s) => nakedSubset(s, 2) },
  { weight: 3.2, find: (s) => fish(s, 2) },
  { weight: 3.4, find: (s) => hiddenSubset(s, 2) },
  { weight: 3.6, find: (s) => nakedSubset(s, 3) },
  { weight: 3.8, find: (s) => fish(s, 3) },
  { weight: 4.0, find: (s) => hiddenSubset(s, 3) },
  { weight: 4.1, find: (s) => turbot(s, "skyscraper") },
  { weight: 4.2, find: (s) => turbot(s, "two-string-kite") },
  { weight: 4.2, find: xyWing },
  { weight: 4.3, find: (s) => turbot(s, "turbot-fish") },
  { weight: 4.4, find: xyzWing },
  { weight: 4.5, find: wWing },
  { weight: 4.5, find: (s) => uniqueRectangle(s, 1) },
  { weight: 4.6, find: (s) => uniqueRectangle(s, 2) },
  { weight: 4.7, find: (s) => uniqueRectangle(s, 4) },
  { weight: 4.8, find: simpleColoring },
  { weight: 5.0, find: (s) => nakedSubset(s, 4) },
  { weight: 5.2, find: (s) => fish(s, 4) },
  { weight: 5.4, find: (s) => hiddenSubset(s, 4) },
  { weight: 5.5, find: (s) => chainStep(s) },
  { weight: 7.0, find: nishio },
  { weight: 8.0, find: cellForcing },
  { weight: 8.2, find: regionForcing },
  { weight: 10, find: trialAndError },
];

export interface NextStepOptions {
  /** Don't try anything that needs more than this weight. */
  maxWeight?: number;
}

/** The easiest next step from this state, or null if nothing is available within `maxWeight`. */
export function nextStep(s: State, options: NextStepOptions = {}): Step | null {
  const cap = options.maxWeight ?? Infinity;
  for (const rung of LADDER) {
    if (rung.weight > cap) break;
    const step = rung.find(s);
    if (step) return step.weight > cap ? null : step;
  }
  return null;
}

export interface SolveTrace {
  steps: Step[];
  solved: boolean;
  /** True when a step above `maxWeight` was needed and the run stopped early. */
  aborted: boolean;
}

/** Solves `grid` step by step with the cheapest-first ladder. */
export function solveWithSteps(grid: string, options: NextStepOptions = {}): SolveTrace {
  const s = stateFromGrid(grid);
  const steps: Step[] = [];
  while (!isSolved(s)) {
    const step = nextStep(s, options);
    if (!step) return { steps, solved: false, aborted: options.maxWeight !== undefined };
    steps.push(step);
    applyStep(s, step);
    if (steps.length > 400) return { steps, solved: false, aborted: false };
  }
  return { steps, solved: true, aborted: false };
}
