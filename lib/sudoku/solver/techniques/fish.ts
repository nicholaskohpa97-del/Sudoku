// Basic fish: X-Wing, Swordfish, Jellyfish (rows or columns as the base).
import { colOf, rowOf } from "../../engine";
import { cellsWith, combinations, eliminationsOf, UNITS, type State } from "../grid";
import type { Step, TechniqueId } from "../types";

const FISH: Record<2 | 3 | 4, { id: TechniqueId; weight: number }> = {
  2: { id: "x-wing", weight: 3.2 },
  3: { id: "swordfish", weight: 3.8 },
  4: { id: "jellyfish", weight: 5.2 },
};

export function fish(s: State, k: 2 | 3 | 4): Step | null {
  for (const rowsBase of [true, false]) {
    for (let d = 1; d <= 9; d++) {
      // Base lines with 2..k candidate cells for d, and the perpendicular index of each.
      const lines: { unit: number; cells: number[]; across: number[] }[] = [];
      for (let k0 = 0; k0 < 9; k0++) {
        const unit = rowsBase ? k0 : 9 + k0;
        const cells = cellsWith(s, unit, d);
        if (cells.length >= 2 && cells.length <= k) {
          lines.push({ unit, cells, across: cells.map((c) => (rowsBase ? colOf(c) : rowOf(c))) });
        }
      }
      if (lines.length < k) continue;
      let found: Step | null = null;
      combinations(lines, k, (base) => {
        const cover = new Set<number>();
        for (const l of base) for (const a of l.across) cover.add(a);
        if (cover.size !== k) return false;
        const baseUnits = new Set(base.map((l) => l.unit));
        const targets: number[] = [];
        for (const a of cover) {
          const coverUnit = rowsBase ? 9 + a : a;
          for (const c of UNITS[coverUnit]) if (!baseUnits.has(rowsBase ? rowOf(c) : 9 + colOf(c))) targets.push(c);
        }
        const eliminations = eliminationsOf(s, targets, d);
        if (!eliminations.length) return false;
        found = {
          technique: FISH[k].id,
          weight: FISH[k].weight,
          placements: [],
          eliminations,
          pattern: base.flatMap((l) => l.cells),
          digits: [d],
          units: [...baseUnits, ...[...cover].map((a) => (rowsBase ? 9 + a : a))],
          detail: { base: base.map((l) => l.unit), cover: [...cover].map((a) => (rowsBase ? 9 + a : a)) },
        };
        return true;
      });
      if (found) return found;
    }
  }
  return null;
}
