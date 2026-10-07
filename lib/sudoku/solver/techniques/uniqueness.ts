// Unique Rectangles (types 1, 2 and 4). They rely on the puzzle having a
// single solution, which every puzzle in this app guarantees.
import { boxOf, colOf, rowOf } from "../../engine";
import { bit, cellsWith, digitsOf, eliminationsOf, popcount, sees, sharedUnits, type State } from "../grid";
import type { Step, TechniqueId } from "../types";

interface Rect {
  cells: [number, number, number, number]; // a b / c d
}

function* rectangles(s: State): Generator<Rect> {
  for (let r1 = 0; r1 < 9; r1++) {
    for (let r2 = r1 + 1; r2 < 9; r2++) {
      for (let c1 = 0; c1 < 9; c1++) {
        for (let c2 = c1 + 1; c2 < 9; c2++) {
          const cells: [number, number, number, number] = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];
          if (cells.some((c) => s.cells[c] !== 0)) continue;
          const boxes = new Set(cells.map(boxOf));
          if (boxes.size !== 2) continue;
          yield { cells };
        }
      }
    }
  }
}

/** Pairs of rectangle corners that share a row or column (not the diagonals). */
const ADJACENT: [number, number][] = [
  [0, 1],
  [2, 3],
  [0, 2],
  [1, 3],
];

export function uniqueRectangle(s: State, type: 1 | 2 | 4): Step | null {
  const id = `unique-rectangle-${type}` as TechniqueId;
  const weight = type === 1 ? 4.5 : type === 2 ? 4.6 : 4.7;
  for (const { cells } of rectangles(s)) {
    let common = 0x3fe;
    for (const c of cells) common &= s.cand[c];
    if (popcount(common) < 2) continue;
    const ds = digitsOf(common);
    for (let i = 0; i < ds.length; i++) {
      for (let j = i + 1; j < ds.length; j++) {
        const x = ds[i];
        const y = ds[j];
        const pair = bit(x) | bit(y);
        const extra = cells.map((c) => s.cand[c] & ~pair);
        const plain = cells.filter((_, k) => extra[k] === 0);
        if (type === 1) {
          if (plain.length !== 3) continue;
          const k = extra.findIndex((e) => e !== 0);
          const eliminations = eliminationsOf(s, [cells[k]], x).concat(eliminationsOf(s, [cells[k]], y));
          if (!eliminations.length) continue;
          return {
            technique: id,
            weight,
            placements: [],
            eliminations,
            pattern: [...cells],
            digits: [x, y],
            units: [],
            detail: { note: "type 1" },
          };
        }
        for (const [fa, fb] of ADJACENT) {
          const roof = [0, 1, 2, 3].filter((k) => k !== fa && k !== fb);
          const floorOk = extra[fa] === 0 && extra[fb] === 0;
          if (!floorOk || roof.some((k) => extra[k] === 0)) continue;
          const [ra, rb] = [cells[roof[0]], cells[roof[1]]];
          if (type === 2) {
            if (extra[roof[0]] !== extra[roof[1]] || popcount(extra[roof[0]]) !== 1) continue;
            const z = digitsOf(extra[roof[0]])[0];
            const targets = Array.from({ length: 81 }, (_, c) => c).filter(
              (c) => c !== ra && c !== rb && sees(c, ra) && sees(c, rb),
            );
            const eliminations = eliminationsOf(s, targets, z);
            if (!eliminations.length) continue;
            return {
              technique: id,
              weight,
              placements: [],
              eliminations,
              pattern: [...cells],
              digits: [x, y, z],
              units: [],
              detail: { note: "type 2" },
            };
          }
          // Type 4: one of the pair's digits is locked to the two roof cells in a shared unit.
          for (const u of sharedUnits(ra, rb)) {
            for (const [locked, other] of [
              [x, y],
              [y, x],
            ]) {
              const spots = cellsWith(s, u, locked);
              if (spots.length !== 2 || !spots.includes(ra) || !spots.includes(rb)) continue;
              const eliminations = eliminationsOf(s, [ra, rb], other);
              if (!eliminations.length) continue;
              return {
                technique: id,
                weight,
                placements: [],
                eliminations,
                pattern: [...cells],
                digits: [locked, other],
                units: [u],
                detail: { unit: u, note: "type 4" },
              };
            }
          }
        }
      }
    }
  }
  return null;
}
void rowOf;
void colOf;
