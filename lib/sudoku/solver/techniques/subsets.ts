// Naked and hidden pairs, triples and quads.
import { bit, cellsWith, combinations, digitsOf, placedMask, popcount, UNITS, type State } from "../grid";
import type { Placement, Step, TechniqueId } from "../types";

const NAKED: Record<2 | 3 | 4, { id: TechniqueId; weight: number }> = {
  2: { id: "naked-pair", weight: 3.0 },
  3: { id: "naked-triple", weight: 3.6 },
  4: { id: "naked-quad", weight: 5.0 },
};
const HIDDEN: Record<2 | 3 | 4, { id: TechniqueId; weight: number }> = {
  2: { id: "hidden-pair", weight: 3.4 },
  3: { id: "hidden-triple", weight: 4.0 },
  4: { id: "hidden-quad", weight: 5.4 },
};

export function nakedSubset(s: State, k: 2 | 3 | 4): Step | null {
  for (let u = 0; u < 27; u++) {
    const empties = UNITS[u].filter((i) => s.cells[i] === 0);
    if (empties.length <= k) continue;
    const pool = empties.filter((i) => popcount(s.cand[i]) >= 2 && popcount(s.cand[i]) <= k);
    let found: Step | null = null;
    combinations(pool, k, (cells) => {
      let union = 0;
      for (const c of cells) union |= s.cand[c];
      if (popcount(union) !== k) return false;
      const eliminations: Placement[] = [];
      for (const other of empties) {
        if (cells.includes(other)) continue;
        for (const d of digitsOf(s.cand[other] & union)) eliminations.push({ cell: other, digit: d });
      }
      if (!eliminations.length) return false;
      found = {
        technique: NAKED[k].id,
        weight: NAKED[k].weight,
        placements: [],
        eliminations,
        pattern: cells,
        digits: digitsOf(union),
        units: [u],
        detail: { unit: u },
      };
      return true;
    });
    if (found) return found;
  }
  return null;
}

export function hiddenSubset(s: State, k: 2 | 3 | 4): Step | null {
  for (let u = 0; u < 27; u++) {
    const pm = placedMask(s, u);
    const empties = UNITS[u].filter((i) => s.cells[i] === 0);
    if (empties.length <= k) continue;
    const spots = new Map<number, number[]>();
    for (let d = 1; d <= 9; d++) {
      if (pm & bit(d)) continue;
      const cs = cellsWith(s, u, d);
      if (cs.length >= 2 && cs.length <= k) spots.set(d, cs);
    }
    let found: Step | null = null;
    combinations([...spots.keys()], k, (digits) => {
      const cells = new Set<number>();
      for (const d of digits) for (const c of spots.get(d)!) cells.add(c);
      if (cells.size !== k) return false;
      let keep = 0;
      for (const d of digits) keep |= bit(d);
      const eliminations: Placement[] = [];
      for (const c of cells) for (const d of digitsOf(s.cand[c] & ~keep)) eliminations.push({ cell: c, digit: d });
      if (!eliminations.length) return false;
      found = {
        technique: HIDDEN[k].id,
        weight: HIDDEN[k].weight,
        placements: [],
        eliminations,
        pattern: [...cells],
        digits,
        units: [u],
        detail: { unit: u },
      };
      return true;
    });
    if (found) return found;
  }
  return null;
}
