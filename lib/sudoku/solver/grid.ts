// Candidate-grid state used by every technique. Plain typed arrays so the
// solver stays fast enough to run on every hint and during bank generation.
import { ALL, bit, boxOf, colOf, digitsOf, PEERS, popcount, rowOf, UNITS } from "../engine";
import type { Placement, Step } from "./types";

export { ALL, bit, digitsOf, popcount, UNITS };

export interface State {
  /** 0 = empty, else the placed digit. */
  cells: Uint8Array;
  /** Candidate bitmask (bits 1..9) per empty cell; 0 for placed cells. */
  cand: Uint16Array;
}

const SEES = new Uint8Array(81 * 81);
for (let i = 0; i < 81; i++) for (const p of PEERS[i]) SEES[i * 81 + p] = 1;

/** True when two different cells share a row, column or box. */
export const sees = (a: number, b: number): boolean => SEES[a * 81 + b] === 1;

export type UnitKind = "row" | "col" | "box";
export const unitKind = (u: number): UnitKind => (u < 9 ? "row" : u < 18 ? "col" : "box");
export const unitsOfCell = (i: number): [number, number, number] => [rowOf(i), 9 + colOf(i), 18 + boxOf(i)];

/** Units shared by two different cells. */
export function sharedUnits(a: number, b: number): number[] {
  const ua = unitsOfCell(a);
  const ub = unitsOfCell(b);
  return ua.filter((u) => ub.includes(u));
}

export const node = (cell: number, digit: number) => cell * 10 + digit;
export const nodeCell = (n: number) => Math.floor(n / 10);
export const nodeDigit = (n: number) => n % 10;

export function stateFromGrid(grid: string): State {
  const cells = new Uint8Array(81);
  for (let i = 0; i < 81; i++) cells[i] = grid.charCodeAt(i) - 48;
  const cand = new Uint16Array(81);
  for (let i = 0; i < 81; i++) {
    if (cells[i] !== 0) continue;
    let used = 0;
    for (const p of PEERS[i]) used |= bit(cells[p]);
    cand[i] = ALL & ~used;
  }
  return { cells, cand };
}

export function cloneState(s: State): State {
  return { cells: s.cells.slice(), cand: s.cand.slice() };
}

export function stateToGrid(s: State): string {
  return Array.from(s.cells).join("");
}

export function placeDigit(s: State, cell: number, digit: number): void {
  s.cells[cell] = digit;
  s.cand[cell] = 0;
  const m = ~bit(digit);
  for (const p of PEERS[cell]) s.cand[p] &= m;
}

/** Removes a candidate. Returns true if it was there. */
export function eliminate(s: State, cell: number, digit: number): boolean {
  if (!(s.cand[cell] & bit(digit))) return false;
  s.cand[cell] &= ~bit(digit);
  return true;
}

export function applyStep(s: State, step: Step): void {
  for (const e of step.eliminations) eliminate(s, e.cell, e.digit);
  for (const p of step.placements) placeDigit(s, p.cell, p.digit);
}

export const hasCand = (s: State, cell: number, digit: number) => (s.cand[cell] & bit(digit)) !== 0;

/** Cells of `unit` that still have `digit` as a candidate. */
export function cellsWith(s: State, unit: number, digit: number): number[] {
  const out: number[] = [];
  const m = bit(digit);
  for (const i of UNITS[unit]) if (s.cand[i] & m) out.push(i);
  return out;
}

/** Digits already placed in `unit`, as a bitmask. */
export function placedMask(s: State, unit: number): number {
  let m = 0;
  for (const i of UNITS[unit]) if (s.cells[i]) m |= bit(s.cells[i]);
  return m;
}

export function isSolved(s: State): boolean {
  for (let i = 0; i < 81; i++) if (s.cells[i] === 0) return false;
  return true;
}

/** True if some cell has no candidate left, or some unit can no longer hold a digit. */
export function hasContradiction(s: State): boolean {
  for (let i = 0; i < 81; i++) if (s.cells[i] === 0 && s.cand[i] === 0) return true;
  for (let u = 0; u < 27; u++) {
    const placed = placedMask(s, u);
    let possible = placed;
    for (const i of UNITS[u]) possible |= s.cand[i];
    if ((possible & ALL) !== ALL) return true;
  }
  return false;
}

/**
 * Applies naked and hidden singles until none are left. `placed` counts the
 * placements made; `contradiction` is set if the assumptions broke the grid.
 */
export function propagateSingles(s: State): { placed: number; contradiction: boolean } {
  let placed = 0;
  let progress = true;
  while (progress) {
    progress = false;
    for (let i = 0; i < 81; i++) {
      if (s.cells[i] !== 0) continue;
      const m = s.cand[i];
      if (m === 0) return { placed, contradiction: true };
      if ((m & (m - 1)) === 0) {
        placeDigit(s, i, digitsOf(m)[0]);
        placed++;
        progress = true;
      }
    }
    for (let u = 0; u < 27; u++) {
      const pm = placedMask(s, u);
      for (let d = 1; d <= 9; d++) {
        if (pm & bit(d)) continue;
        const spots = cellsWith(s, u, d);
        if (spots.length === 0) return { placed, contradiction: true };
        if (spots.length === 1) {
          placeDigit(s, spots[0], d);
          placed++;
          progress = true;
          break;
        }
      }
    }
  }
  return { placed, contradiction: hasContradiction(s) };
}

/** Calls `visit` with every k-sized combination of `items`; stops early when it returns true. */
export function combinations<T>(items: T[], k: number, visit: (combo: T[]) => boolean | void): boolean {
  const combo: T[] = [];
  const rec = (start: number): boolean => {
    if (combo.length === k) return visit(combo.slice()) === true;
    for (let i = start; i <= items.length - (k - combo.length); i++) {
      combo.push(items[i]);
      if (rec(i + 1)) return true;
      combo.pop();
    }
    return false;
  };
  return rec(0);
}

export const place = (cell: number, digit: number): Placement => ({ cell, digit });

/** Candidates in `targets` that are still present, as eliminations of `digit`. */
export function eliminationsOf(s: State, targets: Iterable<number>, digit: number): Placement[] {
  const out: Placement[] = [];
  const seen = new Set<number>();
  for (const c of targets) {
    if (seen.has(c)) continue;
    seen.add(c);
    if (hasCand(s, c, digit)) out.push({ cell: c, digit });
  }
  return out;
}
