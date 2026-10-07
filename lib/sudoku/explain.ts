// Turns solver steps into words: full walkthrough explanations and the three
// escalating hint levels. Hints guide the eye; they never state the answer.
import { boxOf, colOf, rowOf, PEERS } from "./engine";
import { nodeCell, nodeDigit, UNITS, type State } from "./solver/grid";
import { TECHNIQUES } from "./solver/techniques-info";
import type { Placement, Step } from "./solver/types";

export const cellName = (i: number) => `R${rowOf(i) + 1}C${colOf(i) + 1}`;

export function unitName(u: number): string {
  if (u < 9) return `row ${u + 1}`;
  if (u < 18) return `column ${u - 8}`;
  return `box ${u - 17}`;
}

const nodeName = (n: number) => `${nodeDigit(n)} in ${cellName(nodeCell(n))}`;
const join = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
const cellsText = (cells: number[]) => join(cells.map(cellName));
const digitsText = (ds: number[]) => join(ds.map(String));
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

export interface Highlights {
  /** The cells that form the pattern. */
  pattern: number[];
  /** Cells that receive a digit in this step. */
  placed: number[];
  /** Candidates this step removes. */
  removed: Placement[];
  /** Units to tint. */
  units: number[];
  /** Digits to emphasise in the pencil marks. */
  digits: number[];
}

export interface Explanation {
  title: string;
  text: string;
  highlights: Highlights;
}

function highlightsOf(step: Step): Highlights {
  return {
    pattern: step.pattern,
    placed: step.placements.map((p) => p.cell),
    removed: step.eliminations,
    units: step.units,
    digits: step.digits,
  };
}

const removedText = (el: Placement[]) => {
  const byDigit = new Map<number, number[]>();
  for (const e of el) byDigit.set(e.digit, [...(byDigit.get(e.digit) ?? []), e.cell]);
  return join([...byDigit].map(([d, cells]) => `${d} from ${cellsText(cells)}`));
};

/** Placed digits `d` that rule out the other empty cells of `unit`. */
function blockersOf(state: State, unit: number, digit: number, except: number): number[] {
  const blockers = new Set<number>();
  for (const x of UNITS[unit]) {
    if (x === except || state.cells[x] !== 0) continue;
    const b = PEERS[x].find((p) => state.cells[p] === digit && !UNITS[unit].includes(p));
    if (b !== undefined) blockers.add(b);
  }
  return [...blockers];
}

/** The full explanation of a step, for the walkthrough. */
export function explainStep(step: Step, state?: State): Explanation {
  const info = TECHNIQUES[step.technique];
  const d = step.digits[0];
  const highlights = highlightsOf(step);
  const el = step.eliminations;
  const place = step.placements[0];
  let text: string;

  switch (step.technique) {
    case "full-house": {
      text = `${unitName(step.units[0])} has only one empty cell left, ${cellName(place.cell)}, so it must be the missing digit ${place.digit}.`;
      break;
    }
    case "hidden-single": {
      const u = step.units[0];
      const blockers = state ? blockersOf(state, u, place.digit, place.cell) : [];
      text =
        `In ${unitName(u)}, the digit ${place.digit} has only one place left: ${cellName(place.cell)}.` +
        (blockers.length ? ` The ${place.digit}s in ${cellsText(blockers)} rule out every other empty cell there.` : "") +
        ` Place ${place.digit}.`;
      break;
    }
    case "naked-single":
      text = `${cellName(place.cell)} can only be ${place.digit}: every other digit already appears in its row, column or box.`;
      break;
    case "pointing":
      text = `In ${unitName(step.units[0])}, every ${d} that is still possible sits in ${unitName(step.units[1])} (${cellsText(step.pattern)}). So this box's ${d} must be in that line, and no other cell of ${unitName(step.units[1])} can be ${d}. Remove ${removedText(el)}.`;
      break;
    case "claiming":
      text = `In ${unitName(step.units[0])}, every ${d} that is still possible sits inside ${unitName(step.units[1])} (${cellsText(step.pattern)}). So that line's ${d} must be in this box, and no other cell of the box can be ${d}. Remove ${removedText(el)}.`;
      break;
    case "naked-pair":
    case "naked-triple":
    case "naked-quad":
      text = `${cellsText(step.pattern)} in ${unitName(step.units[0])} hold only the digits ${digitsText(step.digits)} between them. Those digits must go in those cells, so no other cell of ${unitName(step.units[0])} can be ${digitsText(step.digits)}. Remove ${removedText(el)}.`;
      break;
    case "hidden-pair":
    case "hidden-triple":
    case "hidden-quad":
      text = `In ${unitName(step.units[0])}, the digits ${digitsText(step.digits)} can only go in ${cellsText(step.pattern)}. Those cells are spoken for, so they can hold nothing else. Remove ${removedText(el)}.`;
      break;
    case "x-wing":
    case "swordfish":
    case "jellyfish": {
      const base = step.detail?.base ?? [];
      const cover = step.detail?.cover ?? [];
      text = `The digit ${d} appears in only ${base.length} places in each of ${join(base.map(unitName))}, and all of them fall inside ${join(cover.map(unitName))}. So ${d} must end up in those crossings, and no other cell of ${join(cover.map(unitName))} can be ${d}. Remove ${removedText(el)}.`;
      break;
    }
    case "skyscraper":
    case "two-string-kite":
    case "turbot-fish": {
      const [p, q, r, t] = (step.detail?.chain ?? []).map(nodeCell);
      text = `For the digit ${d}: in ${unitName(step.units[0])} it's either ${cellName(p)} or ${cellName(q)}, and in ${unitName(step.units[1])} it's either ${cellName(r)} or ${cellName(t)}. ${cellName(q)} and ${cellName(r)} see each other so they can't both be ${d}; therefore ${cellName(p)} or ${cellName(t)} must be. Any cell that sees both can't be ${d}. Remove ${removedText(el)}.`;
      break;
    }
    case "xy-wing": {
      const [a, b] = step.detail!.pincers!;
      const z = el[0].digit;
      text = `${cellName(step.detail!.pivot!)} can only be ${step.digits.filter((x) => x !== z).join(" or ")}. Whichever it is, one of the pincers ${cellName(a)} or ${cellName(b)} has to be ${z}. So any cell that sees both pincers can't be ${z}. Remove ${removedText(el)}.`;
      break;
    }
    case "xyz-wing": {
      const [a, b] = step.detail!.pincers!;
      const z = el[0].digit;
      text = `${cellName(step.detail!.pivot!)} holds ${digitsText(step.digits)}. Whatever it turns out to be, ${z} lands in the pivot or in one of the pincers ${cellName(a)} and ${cellName(b)}. Any cell that sees all three can't be ${z}. Remove ${removedText(el)}.`;
      break;
    }
    case "w-wing": {
      const [a, b] = step.detail!.pincers!;
      const link = step.digits[0];
      const other = step.digits[1];
      text = `${cellName(a)} and ${cellName(b)} both hold only ${digitsText([link, other].sort())}. In ${unitName(step.units[0])} the ${link} has just two places, and each end looks at one of the pair. Whichever way it falls, one of ${cellName(a)} or ${cellName(b)} must be ${other}, so any cell that sees both can't be ${other}. Remove ${removedText(el)}.`;
      break;
    }
    case "unique-rectangle-1":
    case "unique-rectangle-2":
    case "unique-rectangle-4":
      text = `${cellsText(step.pattern)} form a rectangle across two boxes. If all four ended up as ${digitsText(step.digits.slice(0, 2))} the puzzle would have two solutions, which it doesn't, so one of the extra candidates must be real. ${step.detail?.note ?? ""}. Remove ${removedText(el)}.`;
      break;
    case "simple-coloring":
      text =
        step.detail?.note === "wrap"
          ? `Colouring the conjugate pairs of ${d} shows two cells of the same colour that see each other. That colour can't be right, so remove ${removedText(el)}.`
          : `Colouring the conjugate pairs of ${d}: exactly one colour is correct. A cell that sees both colours can't be ${d} either way. Remove ${removedText(el)}.`;
      break;
    case "x-chain":
    case "xy-chain":
    case "aic": {
      const chain = step.detail?.chain ?? [];
      text = step.placements.length
        ? `Follow the chain ${chain.map(nodeName).join(" → ")}. Assuming ${nodeName(chain[0])} is false leads all the way back to it being true, which is a contradiction. So it is true: place ${place.digit} in ${cellName(place.cell)}.`
        : `Follow the chain ${chain.map(nodeName).join(" → ")}. It starts and ends on a pair where one of the two must be true, so at least one end, ${nodeName(chain[0])} or ${nodeName(chain[chain.length - 1])}, is true. Any candidate that sees both ends can't be. Remove ${removedText(el)}.`;
      break;
    }
    case "nishio": {
      const a = step.detail!.assumption!;
      text = `Suppose ${nodeName(a)} were true. Following only singles, the grid breaks after ${step.detail?.propagation ?? "a few"} ${plural(step.detail?.propagation ?? 2, "placement")}: some cell or unit is left with no possible digit. So ${nodeName(a)} is false. Remove it.`;
      break;
    }
    case "cell-forcing":
      text = `Try each digit of ${cellName(step.pattern[0])} (${digitsText(step.digits)}) in turn and follow the singles. All of them lead to the same result, so it must hold. ${place ? `Place ${step.placements.map((p) => `${p.digit} in ${cellName(p.cell)}`).join(", ")}.` : `Remove ${removedText(el)}.`}`;
      break;
    case "region-forcing":
      text = `Try each place ${d} can go in ${unitName(step.units[0])} and follow the singles. All of them lead to the same result, so it must hold. ${place ? `Place ${step.placements.map((p) => `${p.digit} in ${cellName(p.cell)}`).join(", ")}.` : `Remove ${removedText(el)}.`}`;
      break;
    case "trial-and-error":
      text = `No logical step is left that this guide knows. Testing ${cellName(place.cell)}: ${place.digit} is the digit that works.`;
      break;
    default:
      text = info.blurb;
  }
  return { title: info.name, text, highlights };
}

// ---------------------------------------------------------------------------
// Hints

export interface HintLevel {
  text: string;
  highlights: Highlights;
}

const NO_HIGHLIGHT: Highlights = { pattern: [], placed: [], removed: [], units: [], digits: [] };

/** A neighbourhood for level 1: the box of the pattern, or the unit if the step is about one. */
function areaOf(step: Step): number {
  if (step.technique === "hidden-single" || step.technique === "full-house") return step.units[0];
  if (step.technique === "naked-single") return 18 + boxOf(step.placements[0].cell);
  const u = step.units.find((x) => x >= 0);
  if (u !== undefined && step.units.length) return u;
  return 18 + boxOf(step.pattern[0]);
}

/**
 * Three levels, each a little more revealing, none giving the digit to enter.
 * 1: where to look. 2: what to look for. 3: the cells that matter, highlighted.
 */
export function hintLevels(step: Step, state: State): [HintLevel, HintLevel, HintLevel] {
  const info = TECHNIQUES[step.technique];
  const area = areaOf(step);
  const place = step.placements[0];

  const l1: HintLevel = {
    text: `Take another look at ${unitName(area)}.`,
    highlights: { ...NO_HIGHLIGHT, units: [area] },
  };

  let l2Text: string;
  let l3Text: string;
  let l3: Highlights;
  switch (step.technique) {
    case "full-house":
      l2Text = `${unitName(area)} is nearly full: only one cell is left, so the missing digit has to go there.`;
      l3Text = "Find the single empty cell, then work out which digit the unit is missing.";
      l3 = { ...NO_HIGHLIGHT, units: [area], pattern: step.pattern };
      break;
    case "hidden-single": {
      const blockers = blockersOf(state, area, place.digit, place.cell);
      l2Text = `There's a Hidden Single here: the digit ${place.digit} can only go in one cell of ${unitName(area)}.`;
      l3Text = `The ${place.digit}s in the highlighted cells rule out every other empty cell of ${unitName(area)}. Which cell is left?`;
      l3 = { ...NO_HIGHLIGHT, units: [area], pattern: blockers, digits: [place.digit] };
      break;
    }
    case "naked-single":
      l2Text = `There's a Naked Single in ${unitName(area)}: one cell there has only one digit that still fits.`;
      l3Text = "That cell is highlighted. Check its row, column and box: which digit is the only one missing?";
      l3 = { ...NO_HIGHLIGHT, units: [area], pattern: [place.cell] };
      break;
    default: {
      const digitHint = step.digits.length <= 2 ? ` Focus on the ${digitsText(step.digits)}s.` : "";
      l2Text = `Look for a ${info.name}.${digitHint} ${info.blurb}`;
      l3Text = step.placements.length
        ? "The highlighted cells are the ones that matter. Follow the logic to find the cell you can fill."
        : `The highlighted cells form the pattern. Work out which pencil marks it lets you remove: that unlocks the next number.`;
      l3 = { ...NO_HIGHLIGHT, units: step.units, pattern: step.pattern, digits: step.digits };
    }
  }
  return [
    l1,
    { text: l2Text, highlights: { ...NO_HIGHLIGHT, units: [area], digits: step.technique === "naked-single" ? [] : step.digits.length <= 2 ? step.digits : [] } },
    { text: l3Text, highlights: l3 },
  ];
}
