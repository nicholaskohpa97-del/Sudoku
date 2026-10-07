// Singles and locked candidates.
import { boxOf, colOf, rowOf } from "../../engine";
import { bit, cellsWith, digitsOf, eliminationsOf, placedMask, popcount, UNITS, unitKind, ALL, type State } from "../grid";
import type { Step } from "../types";

export function fullHouse(s: State): Step | null {
  for (let u = 0; u < 27; u++) {
    const empties = UNITS[u].filter((i) => s.cells[i] === 0);
    if (empties.length !== 1) continue;
    const missing = ALL & ~placedMask(s, u);
    const digit = digitsOf(missing)[0];
    if (!digit) continue;
    return {
      technique: "full-house",
      weight: 1.0,
      placements: [{ cell: empties[0], digit }],
      eliminations: [],
      pattern: [empties[0]],
      digits: [digit],
      units: [u],
      detail: { unit: u },
    };
  }
  return null;
}

function hiddenSingleIn(s: State, units: number[], weight: number): Step | null {
  for (const u of units) {
    const pm = placedMask(s, u);
    for (let d = 1; d <= 9; d++) {
      if (pm & bit(d)) continue;
      const spots = cellsWith(s, u, d);
      if (spots.length === 1) {
        return {
          technique: "hidden-single",
          weight,
          placements: [{ cell: spots[0], digit: d }],
          eliminations: [],
          pattern: [spots[0]],
          digits: [d],
          units: [u],
          detail: { unit: u },
        };
      }
    }
  }
  return null;
}

const BOX_UNITS = [18, 19, 20, 21, 22, 23, 24, 25, 26];
const LINE_UNITS = Array.from({ length: 18 }, (_, k) => k);

/** A hidden single found in a box: the easiest kind to spot (weight 1.2). */
export const hiddenSingleBox = (s: State) => hiddenSingleIn(s, BOX_UNITS, 1.2);
/** A hidden single found in a row or column (weight 1.5). */
export const hiddenSingleLine = (s: State) => hiddenSingleIn(s, LINE_UNITS, 1.5);

export function nakedSingle(s: State): Step | null {
  for (let i = 0; i < 81; i++) {
    if (s.cells[i] !== 0 || popcount(s.cand[i]) !== 1) continue;
    const digit = digitsOf(s.cand[i])[0];
    return {
      technique: "naked-single",
      weight: 2.3,
      placements: [{ cell: i, digit }],
      eliminations: [],
      pattern: [i],
      digits: [digit],
      units: [rowOf(i), 9 + colOf(i), 18 + boxOf(i)],
    };
  }
  return null;
}

/** Box → line: a digit in a box confined to one row/column clears the rest of that line. */
export function pointing(s: State): Step | null {
  for (let b = 18; b < 27; b++) {
    for (let d = 1; d <= 9; d++) {
      const spots = cellsWith(s, b, d);
      if (spots.length < 2) continue;
      for (const [line, key] of [
        [rowOf(spots[0]), rowOf],
        [9 + colOf(spots[0]), (i: number) => 9 + colOf(i)],
      ] as [number, (i: number) => number][]) {
        if (!spots.every((i) => key(i) === line)) continue;
        const targets = UNITS[line].filter((i) => boxOf(i) !== b - 18);
        const eliminations = eliminationsOf(s, targets, d);
        if (!eliminations.length) continue;
        return {
          technique: "pointing",
          weight: 2.6,
          placements: [],
          eliminations,
          pattern: spots,
          digits: [d],
          units: [b, line],
          detail: { unit: b, lockedIn: line },
        };
      }
    }
  }
  return null;
}

/** Line → box: a digit in a row/column confined to one box clears the rest of that box. */
export function claiming(s: State): Step | null {
  for (let u = 0; u < 18; u++) {
    for (let d = 1; d <= 9; d++) {
      const spots = cellsWith(s, u, d);
      if (spots.length < 2) continue;
      const box = boxOf(spots[0]);
      if (!spots.every((i) => boxOf(i) === box)) continue;
      const targets = UNITS[18 + box].filter((i) => !spots.includes(i) && !(unitKind(u) === "row" ? rowOf(i) === u : colOf(i) === u - 9));
      const eliminations = eliminationsOf(s, targets, d);
      if (!eliminations.length) continue;
      return {
        technique: "claiming",
        weight: 2.8,
        placements: [],
        eliminations,
        pattern: spots,
        digits: [d],
        units: [u, 18 + box],
        detail: { unit: u, lockedIn: 18 + box },
      };
    }
  }
  return null;
}
