// Alternating inference chains (AIC), with the X-Chain and XY-Chain special cases.
//
// A node is a candidate (cell * 10 + digit). A strong link says "if one is
// false the other is true" (a bivalue cell, or a digit with two spots in a
// unit). A weak link says "they can't both be true" (same cell, or same digit
// in cells that see each other). A chain that starts and ends on strong links
// proves that one of its two ends is true, so anything that sees both ends
// can't be.
import { PEERS } from "../../engine";
import { bit, cellsWith, digitsOf, nodeCell, nodeDigit, popcount, UNITS, type State } from "../grid";
import { chainWeight } from "../techniques-info";
import type { Placement, Step, TechniqueId } from "../types";

interface Graph {
  nodes: number[];
  strong: Map<number, number[]>;
}

function buildGraph(s: State): Graph {
  const nodes: number[] = [];
  const strong = new Map<number, Set<number>>();
  const link = (a: number, b: number) => {
    if (!strong.has(a)) strong.set(a, new Set());
    if (!strong.has(b)) strong.set(b, new Set());
    strong.get(a)!.add(b);
    strong.get(b)!.add(a);
  };
  for (let i = 0; i < 81; i++) {
    if (s.cells[i] !== 0) continue;
    for (const d of digitsOf(s.cand[i])) nodes.push(i * 10 + d);
    if (popcount(s.cand[i]) === 2) {
      const [x, y] = digitsOf(s.cand[i]);
      link(i * 10 + x, i * 10 + y);
    }
  }
  for (let u = 0; u < 27; u++) {
    for (let d = 1; d <= 9; d++) {
      const cs = cellsWith(s, u, d);
      if (cs.length === 2) link(cs[0] * 10 + d, cs[1] * 10 + d);
    }
  }
  const out = new Map<number, number[]>();
  for (const [k, v] of strong) out.set(k, [...v]);
  return { nodes, strong: out };
}

/** Nodes that cannot be true when `n` is true. */
function weakNeighbours(s: State, n: number): number[] {
  const cell = nodeCell(n);
  const d = nodeDigit(n);
  const out: number[] = [];
  for (const o of digitsOf(s.cand[cell] & ~bit(d))) out.push(cell * 10 + o);
  for (const p of PEERS[cell]) if (s.cand[p] & bit(d)) out.push(p * 10 + d);
  return out;
}

function weaklyLinked(a: number, b: number): boolean {
  const ca = nodeCell(a);
  const cb = nodeCell(b);
  const da = nodeDigit(a);
  const db = nodeDigit(b);
  if (ca === cb) return da !== db;
  return da === db && PEERS[ca].includes(cb);
}

interface Found {
  chain: number[];
  eliminations: Placement[];
  placement: Placement | null;
}

function search(s: State, graph: Graph, maxStrong: number): Found | null {
  const starts = graph.nodes.filter((n) => graph.strong.has(n));
  for (const a0 of starts) {
    const trueFrom = new Map<number, number>(); // true-state node -> false-state node it came from
    const falseFrom = new Map<number, number>(); // false-state node -> true-state node it came from
    falseFrom.set(a0, -1);
    let falseLayer = [a0];
    for (let k = 1; k <= maxStrong && falseLayer.length; k++) {
      const trueLayer: number[] = [];
      for (const f of falseLayer) {
        for (const t of graph.strong.get(f) ?? []) {
          if (!trueFrom.has(t)) {
            trueFrom.set(t, f);
            trueLayer.push(t);
          }
        }
      }
      for (const t of trueLayer) {
        if (k < 2) continue;
        const chain = rebuild(a0, t, trueFrom, falseFrom);
        if (t === a0) {
          return { chain, eliminations: [], placement: { cell: nodeCell(a0), digit: nodeDigit(a0) } };
        }
        const eliminations: Placement[] = [];
        for (const c of weakNeighbours(s, a0)) {
          if (c !== t && weaklyLinked(c, t)) eliminations.push({ cell: nodeCell(c), digit: nodeDigit(c) });
        }
        if (eliminations.length) return { chain, eliminations, placement: null };
      }
      const nextFalse: number[] = [];
      for (const t of trueLayer) {
        for (const w of weakNeighbours(s, t)) {
          if (!falseFrom.has(w)) {
            falseFrom.set(w, t);
            nextFalse.push(w);
          }
        }
      }
      falseLayer = nextFalse;
    }
  }
  return null;
}

function rebuild(a0: number, end: number, trueFrom: Map<number, number>, falseFrom: Map<number, number>): number[] {
  const out: number[] = [end];
  let cur = end;
  // Walk back: true node <- false node <- true node ... until the start.
  for (let guard = 0; guard < 64; guard++) {
    const f = trueFrom.get(cur)!;
    out.push(f);
    if (f === a0) break;
    cur = falseFrom.get(f)!;
    out.push(cur);
  }
  return out.reverse();
}

function classify(chain: number[]): TechniqueId {
  const digits = new Set(chain.map(nodeDigit));
  if (digits.size === 1) return "x-chain";
  let allCells = true;
  for (let i = 0; i + 1 < chain.length; i += 2) if (nodeCell(chain[i]) !== nodeCell(chain[i + 1])) allCells = false;
  return allCells ? "xy-chain" : "aic";
}

/** The shortest alternating inference chain with a useful conclusion. */
export function chainStep(s: State, maxStrong = 7): Step | null {
  const graph = buildGraph(s);
  // Iterative deepening so the cheapest (shortest) chain wins.
  for (let k = 2; k <= maxStrong; k++) {
    const found = search(s, graph, k);
    if (!found) continue;
    const { chain, eliminations, placement } = found;
    return {
      technique: classify(chain),
      weight: chainWeight(chain.length),
      placements: placement ? [placement] : [],
      eliminations,
      pattern: [...new Set(chain.map(nodeCell))],
      digits: [...new Set(chain.map(nodeDigit))],
      units: [],
      detail: { chain, note: placement ? "loop" : undefined },
    };
  }
  return null;
}
void UNITS;
