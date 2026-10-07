// Single-digit patterns: Skyscraper, 2-String Kite, Turbot Fish and Simple Coloring.
import { boxOf, colOf, PEERS, rowOf } from "../../engine";
import { cellsWith, eliminationsOf, sees, sharedUnits, UNITS, unitKind, type State } from "../grid";
import type { Step, TechniqueId } from "../types";

type Link = { a: number; b: number; unit: number };

/** All conjugate pairs (units where `digit` has exactly two candidate cells). */
export function strongLinks(s: State, digit: number): Link[] {
  const out: Link[] = [];
  for (let u = 0; u < 27; u++) {
    const cs = cellsWith(s, u, digit);
    if (cs.length === 2) out.push({ a: cs[0], b: cs[1], unit: u });
  }
  return out;
}

type TurbotKind = "skyscraper" | "two-string-kite" | "turbot-fish";

const TURBOT_WEIGHT: Record<TurbotKind, number> = { skyscraper: 4.1, "two-string-kite": 4.2, "turbot-fish": 4.3 };

function classify(l1: Link, l2: Link, q: number, r: number): TurbotKind {
  const k1 = unitKind(l1.unit);
  const k2 = unitKind(l2.unit);
  if (k1 === "box" || k2 === "box") return "turbot-fish";
  if (k1 === k2) {
    // Parallel links joined along the perpendicular line.
    const perpendicular = k1 === "row" ? colOf(q) === colOf(r) : rowOf(q) === rowOf(r);
    return perpendicular ? "skyscraper" : "turbot-fish";
  }
  return boxOf(q) === boxOf(r) ? "two-string-kite" : "turbot-fish";
}

/** Two conjugate pairs joined by a weak link: one of the two free ends must hold the digit. */
export function turbot(s: State, want: TurbotKind): Step | null {
  for (let d = 1; d <= 9; d++) {
    const links = strongLinks(s, d);
    for (let i = 0; i < links.length; i++) {
      for (let j = 0; j < links.length; j++) {
        if (i === j) continue;
        const l1 = links[i];
        const l2 = links[j];
        for (const [p, q] of [
          [l1.a, l1.b],
          [l1.b, l1.a],
        ]) {
          for (const [r, t] of [
            [l2.a, l2.b],
            [l2.b, l2.a],
          ]) {
            if (new Set([p, q, r, t]).size !== 4 || !sees(q, r)) continue;
            if (classify(l1, l2, q, r) !== want) continue;
            const targets = PEERS[p].filter((c) => c !== q && c !== r && c !== t && sees(c, t));
            const eliminations = eliminationsOf(s, targets, d);
            if (!eliminations.length) continue;
            return {
              technique: want as TechniqueId,
              weight: TURBOT_WEIGHT[want],
              placements: [],
              eliminations,
              pattern: [p, q, r, t],
              digits: [d],
              units: [l1.unit, l2.unit],
              detail: { chain: [p * 10 + d, q * 10 + d, r * 10 + d, t * 10 + d] },
            };
          }
        }
      }
    }
  }
  return null;
}

export function simpleColoring(s: State): Step | null {
  for (let d = 1; d <= 9; d++) {
    const links = strongLinks(s, d);
    const adj = new Map<number, number[]>();
    for (const { a, b } of links) {
      adj.set(a, [...(adj.get(a) ?? []), b]);
      adj.set(b, [...(adj.get(b) ?? []), a]);
    }
    const colour = new Map<number, 0 | 1>();
    for (const start of adj.keys()) {
      if (colour.has(start)) continue;
      const comp: [number[], number[]] = [[], []];
      colour.set(start, 0);
      const queue = [start];
      while (queue.length) {
        const c = queue.shift()!;
        comp[colour.get(c)!].push(c);
        for (const n of adj.get(c) ?? []) {
          if (!colour.has(n)) {
            colour.set(n, (1 - colour.get(c)!) as 0 | 1);
            queue.push(n);
          }
        }
      }
      if (comp[0].length + comp[1].length < 4) continue;
      const inComp = new Set([...comp[0], ...comp[1]]);
      // Rule 2 (colour wrap): two cells of one colour see each other, so that colour is false.
      for (const k of [0, 1] as const) {
        const cs = comp[k];
        const clash = cs.some((x, i) => cs.slice(i + 1).some((y) => sees(x, y)));
        if (!clash) continue;
        const eliminations = eliminationsOf(s, cs, d);
        if (!eliminations.length) continue;
        return {
          technique: "simple-coloring",
          weight: 4.8,
          placements: [],
          eliminations,
          pattern: [...inComp],
          digits: [d],
          units: [],
          detail: { colors: comp, note: "wrap" },
        };
      }
      // Rule 4 (colour trap): a cell seeing both colours can't hold the digit.
      const trapped: number[] = [];
      for (let c = 0; c < 81; c++) {
        if (inComp.has(c) || !(s.cand[c] & (1 << d))) continue;
        if (comp[0].some((x) => sees(c, x)) && comp[1].some((x) => sees(c, x))) trapped.push(c);
      }
      const eliminations = eliminationsOf(s, trapped, d);
      if (eliminations.length) {
        return {
          technique: "simple-coloring",
          weight: 4.8,
          placements: [],
          eliminations,
          pattern: [...inComp],
          digits: [d],
          units: [],
          detail: { colors: comp, note: "trap" },
        };
      }
    }
  }
  return null;
}
void UNITS;
void sharedUnits;
