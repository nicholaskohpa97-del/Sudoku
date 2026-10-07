// Forcing techniques for the Master tier: Nishio, cell and region forcing,
// plus the trial-and-error fallback. All of them assume a candidate and
// follow naked/hidden singles.
import { digitsOf, cellsWith, cloneState, placeDigit, placedMask, popcount, propagateSingles, stateToGrid, UNITS, bit, type State } from "../grid";
import { solve } from "../../engine";
import { nishioWeight } from "../techniques-info";
import type { Placement, Step } from "../types";

export function nishio(s: State): Step | null {
  let best: Step | null = null;
  let bestDepth = Infinity;
  for (let i = 0; i < 81; i++) {
    if (s.cells[i] !== 0 || popcount(s.cand[i]) < 2) continue;
    for (const d of digitsOf(s.cand[i])) {
      const t = cloneState(s);
      placeDigit(t, i, d);
      const { placed, contradiction } = propagateSingles(t);
      if (!contradiction || placed >= bestDepth) continue;
      bestDepth = placed;
      best = {
        technique: "nishio",
        weight: nishioWeight(placed),
        placements: [],
        eliminations: [{ cell: i, digit: d }],
        pattern: [i],
        digits: [d],
        units: [],
        detail: { assumption: i * 10 + d, propagation: placed },
      };
    }
  }
  return best;
}

interface Branch {
  cell: number;
  digit: number;
}

/** What every branch agrees on after following singles. */
function commonConclusions(s: State, branches: Branch[]): { placements: Placement[]; eliminations: Placement[]; depth: number } | null {
  const results: State[] = [];
  let depth = 0;
  for (const b of branches) {
    const t = cloneState(s);
    placeDigit(t, b.cell, b.digit);
    const r = propagateSingles(t);
    if (r.contradiction) return null; // Nishio's job.
    depth = Math.max(depth, r.placed);
    results.push(t);
  }
  const placements: Placement[] = [];
  const eliminations: Placement[] = [];
  for (let c = 0; c < 81; c++) {
    if (s.cells[c] !== 0) continue;
    const d0 = results[0].cells[c];
    if (d0 !== 0 && results.every((r) => r.cells[c] === d0)) placements.push({ cell: c, digit: d0 });
    for (const d of digitsOf(s.cand[c])) {
      const falseIn = (r: State) => (r.cells[c] !== 0 ? r.cells[c] !== d : !(r.cand[c] & bit(d)));
      if (results.every(falseIn) && !placements.some((p) => p.cell === c)) eliminations.push({ cell: c, digit: d });
    }
  }
  if (!placements.length && !eliminations.length) return null;
  return { placements, eliminations, depth };
}

export function cellForcing(s: State): Step | null {
  let best: Step | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < 81; i++) {
    const n = popcount(s.cand[i]);
    if (s.cells[i] !== 0 || n < 2 || n > 3) continue;
    const branches = digitsOf(s.cand[i]).map((digit) => ({ cell: i, digit }));
    const r = commonConclusions(s, branches);
    if (!r) continue;
    const score = r.depth + n * 3;
    if (score >= bestScore) continue;
    bestScore = score;
    best = {
      technique: "cell-forcing",
      weight: Math.min(9, 8 + 0.02 * r.depth),
      placements: r.placements,
      eliminations: r.eliminations,
      pattern: [i],
      digits: digitsOf(s.cand[i]),
      units: [],
      detail: { propagation: r.depth },
    };
  }
  return best;
}

export function regionForcing(s: State): Step | null {
  let best: Step | null = null;
  let bestScore = Infinity;
  for (let u = 0; u < 27; u++) {
    const pm = placedMask(s, u);
    for (let d = 1; d <= 9; d++) {
      if (pm & bit(d)) continue;
      const spots = cellsWith(s, u, d);
      if (spots.length < 2 || spots.length > 3) continue;
      const r = commonConclusions(s, spots.map((cell) => ({ cell, digit: d })));
      if (!r) continue;
      const score = r.depth + spots.length * 3;
      if (score >= bestScore) continue;
      bestScore = score;
      best = {
        technique: "region-forcing",
        weight: Math.min(9.2, 8.2 + 0.02 * r.depth),
        placements: r.placements,
        eliminations: r.eliminations,
        pattern: spots,
        digits: [d],
        units: [u],
        detail: { unit: u, propagation: r.depth },
      };
    }
  }
  return best;
}

/** Last resort: nothing in the ladder applies, so we must guess. Uses the real solution. */
export function trialAndError(s: State): Step | null {
  const solution = solve(stateToGrid(s));
  if (!solution) return null;
  let cell = -1;
  let fewest = 10;
  for (let i = 0; i < 81; i++) {
    if (s.cells[i] !== 0) continue;
    const n = popcount(s.cand[i]);
    if (n < fewest) {
      fewest = n;
      cell = i;
    }
  }
  if (cell < 0) return null;
  const digit = Number(solution[cell]);
  return {
    technique: "trial-and-error",
    weight: 10,
    placements: [{ cell, digit }],
    eliminations: [],
    pattern: [cell],
    digits: digitsOf(s.cand[cell]),
    units: [],
  };
}
void UNITS;
