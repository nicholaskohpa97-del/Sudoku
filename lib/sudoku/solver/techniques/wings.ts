// XY-Wing, XYZ-Wing and W-Wing.
import { PEERS } from "../../engine";
import { bit, cellsWith, digitsOf, eliminationsOf, popcount, sees, UNITS, type State } from "../grid";
import type { Step } from "../types";

const bivalue = (s: State, i: number) => s.cells[i] === 0 && popcount(s.cand[i]) === 2;

export function xyWing(s: State): Step | null {
  for (let p = 0; p < 81; p++) {
    if (!bivalue(s, p)) continue;
    const [x, y] = digitsOf(s.cand[p]);
    const peers = PEERS[p].filter((q) => bivalue(s, q));
    for (const a of peers) {
      const ca = s.cand[a];
      // Pincer a shares exactly one digit with the pivot.
      if (popcount(ca & s.cand[p]) !== 1) continue;
      const shared = ca & s.cand[p];
      const z = digitsOf(ca & ~shared)[0];
      const otherPivot = shared === bit(x) ? y : x;
      for (const b of peers) {
        if (b === a || s.cand[b] !== (bit(otherPivot) | bit(z))) continue;
        const targets = PEERS[a].filter((c) => c !== p && c !== b && sees(c, b));
        const eliminations = eliminationsOf(s, targets, z);
        if (!eliminations.length) continue;
        return {
          technique: "xy-wing",
          weight: 4.2,
          placements: [],
          eliminations,
          pattern: [p, a, b],
          digits: [x, y, z],
          units: [],
          detail: { pivot: p, pincers: [a, b] },
        };
      }
    }
  }
  return null;
}

export function xyzWing(s: State): Step | null {
  for (let p = 0; p < 81; p++) {
    if (s.cells[p] !== 0 || popcount(s.cand[p]) !== 3) continue;
    const peers = PEERS[p].filter((q) => bivalue(s, q) && (s.cand[q] & ~s.cand[p]) === 0);
    for (let i = 0; i < peers.length; i++) {
      for (let j = i + 1; j < peers.length; j++) {
        const a = peers[i];
        const b = peers[j];
        const common = s.cand[a] & s.cand[b];
        if (popcount(common) !== 1 || (s.cand[a] | s.cand[b]) !== s.cand[p]) continue;
        const z = digitsOf(common)[0];
        const targets = PEERS[p].filter((c) => c !== a && c !== b && sees(c, a) && sees(c, b));
        const eliminations = eliminationsOf(s, targets, z);
        if (!eliminations.length) continue;
        return {
          technique: "xyz-wing",
          weight: 4.4,
          placements: [],
          eliminations,
          pattern: [p, a, b],
          digits: digitsOf(s.cand[p]),
          units: [],
          detail: { pivot: p, pincers: [a, b] },
        };
      }
    }
  }
  return null;
}

export function wWing(s: State): Step | null {
  const pairs: number[] = [];
  for (let i = 0; i < 81; i++) if (bivalue(s, i)) pairs.push(i);
  // Conjugate pairs per digit.
  const strong: [number, number, number][][] = Array.from({ length: 10 }, () => []);
  for (let u = 0; u < 27; u++) {
    for (let d = 1; d <= 9; d++) {
      const cs = cellsWith(s, u, d);
      if (cs.length === 2) strong[d].push([cs[0], cs[1], u]);
    }
  }
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const a = pairs[i];
      const b = pairs[j];
      if (s.cand[a] !== s.cand[b] || sees(a, b)) continue;
      for (const [link, other] of [
        [digitsOf(s.cand[a])[0], digitsOf(s.cand[a])[1]],
        [digitsOf(s.cand[a])[1], digitsOf(s.cand[a])[0]],
      ]) {
        for (const [p, q, u] of strong[link]) {
          if (p === a || p === b || q === a || q === b) continue;
          const ok = (sees(p, a) && sees(q, b)) || (sees(q, a) && sees(p, b));
          if (!ok) continue;
          const targets = PEERS[a].filter((c) => c !== b && sees(c, b));
          const eliminations = eliminationsOf(s, targets, other);
          if (!eliminations.length) continue;
          return {
            technique: "w-wing",
            weight: 4.5,
            placements: [],
            eliminations,
            pattern: [a, b, p, q],
            digits: [link, other],
            units: [u],
            detail: { pincers: [a, b], unit: u },
          };
        }
      }
    }
  }
  return null;
}
void UNITS;
