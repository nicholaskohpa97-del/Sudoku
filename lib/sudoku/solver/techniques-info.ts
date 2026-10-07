import type { TechniqueId, TechniqueInfo } from "./types";

/**
 * Catalogue of techniques with their nominal difficulty weight. Weights
 * follow the spirit of the Sudoku Explainer scale: hidden singles ≈ 1.2–1.5,
 * naked singles 2.3, locked candidates 2.6–2.8, subsets and basic fish 3.0–5.4,
 * wings and single-digit patterns ≈ 4–5, chains from 5.5, forcing chains 7+.
 */
export const TECHNIQUES: Record<TechniqueId, TechniqueInfo> = {
  "full-house": { name: "Full House", family: "singles", weight: 1.0, blurb: "The last empty cell in a row, column or box." },
  "hidden-single": { name: "Hidden Single", family: "singles", weight: 1.2, blurb: "A digit that has only one possible cell left in a unit." },
  "naked-single": { name: "Naked Single", family: "singles", weight: 2.3, blurb: "A cell where only one digit is still possible." },
  pointing: { name: "Pointing Pair/Triple", family: "locked", weight: 2.6, blurb: "Inside a box a digit is confined to one line, so it can't be anywhere else on that line." },
  claiming: { name: "Box/Line Reduction", family: "locked", weight: 2.8, blurb: "In a line a digit is confined to one box, so it can't be anywhere else in that box." },
  "naked-pair": { name: "Naked Pair", family: "subsets", weight: 3.0, blurb: "Two cells in a unit share the same two candidates, which locks those digits to them." },
  "hidden-pair": { name: "Hidden Pair", family: "subsets", weight: 3.4, blurb: "Two digits appear in only two cells of a unit, so those cells can hold nothing else." },
  "naked-triple": { name: "Naked Triple", family: "subsets", weight: 3.6, blurb: "Three cells in a unit use only three digits between them." },
  "hidden-triple": { name: "Hidden Triple", family: "subsets", weight: 4.0, blurb: "Three digits live only in three cells of a unit." },
  "naked-quad": { name: "Naked Quad", family: "subsets", weight: 5.0, blurb: "Four cells in a unit use only four digits between them." },
  "hidden-quad": { name: "Hidden Quad", family: "subsets", weight: 5.4, blurb: "Four digits live only in four cells of a unit." },
  "x-wing": { name: "X-Wing", family: "fish", weight: 3.2, blurb: "A digit sits in the same two columns in two rows, forming a rectangle." },
  swordfish: { name: "Swordfish", family: "fish", weight: 3.8, blurb: "An X-Wing stretched over three lines." },
  jellyfish: { name: "Jellyfish", family: "fish", weight: 5.2, blurb: "An X-Wing stretched over four lines." },
  skyscraper: { name: "Skyscraper", family: "single-digit", weight: 4.1, blurb: "Two parallel conjugate pairs of one digit joined at one end." },
  "two-string-kite": { name: "2-String Kite", family: "single-digit", weight: 4.2, blurb: "A row pair and a column pair of one digit joined inside a box." },
  "turbot-fish": { name: "Turbot Fish", family: "single-digit", weight: 4.3, blurb: "Two conjugate pairs of one digit linked by a weak link." },
  "xy-wing": { name: "XY-Wing", family: "wings", weight: 4.2, blurb: "A two-candidate pivot and two pincers that all force the same digit." },
  "xyz-wing": { name: "XYZ-Wing", family: "wings", weight: 4.4, blurb: "A three-candidate pivot with two pincers sharing one digit." },
  "w-wing": { name: "W-Wing", family: "wings", weight: 4.5, blurb: "Two identical two-candidate cells tied together by a conjugate pair." },
  "unique-rectangle-1": { name: "Unique Rectangle (Type 1)", family: "uniqueness", weight: 4.5, blurb: "Avoids a deadly rectangle that would give two solutions." },
  "unique-rectangle-2": { name: "Unique Rectangle (Type 2)", family: "uniqueness", weight: 4.6, blurb: "Avoids a deadly rectangle using a shared extra digit." },
  "unique-rectangle-4": { name: "Unique Rectangle (Type 4)", family: "uniqueness", weight: 4.7, blurb: "Avoids a deadly rectangle using a locked digit." },
  "simple-coloring": { name: "Simple Coloring", family: "single-digit", weight: 4.8, blurb: "Colour a chain of conjugate pairs and find the contradiction." },
  "x-chain": { name: "X-Chain", family: "chains", weight: 5.5, blurb: "A chain of one digit alternating strong and weak links." },
  "xy-chain": { name: "XY-Chain", family: "chains", weight: 5.5, blurb: "A chain of two-candidate cells passing a digit along." },
  aic: { name: "Alternating Inference Chain", family: "chains", weight: 5.5, blurb: "A chain of cause and effect across digits and cells." },
  nishio: { name: "Nishio Forcing Chain", family: "forcing", weight: 7.0, blurb: "Assume a candidate is true and follow the singles until the grid breaks." },
  "cell-forcing": { name: "Cell Forcing Chain", family: "forcing", weight: 8.0, blurb: "Every candidate of one cell leads to the same conclusion." },
  "region-forcing": { name: "Region Forcing Chain", family: "forcing", weight: 8.2, blurb: "Every place a digit can go in a unit leads to the same conclusion." },
  "trial-and-error": { name: "Trial and Error", family: "forcing", weight: 10, blurb: "No logic available short of testing a guess." },
};

export function techniqueName(id: TechniqueId): string {
  return TECHNIQUES[id].name;
}

/** Weight of a chain-like step by its length (nodes). Capped inside the Expert band. */
export function chainWeight(nodes: number): number {
  return Math.min(6.9, Math.round((4.7 + 0.2 * nodes) * 10) / 10);
}

/** Weight of a Nishio step by propagation depth. Stays inside the Master band. */
export function nishioWeight(propagation: number): number {
  return Math.min(8.5, Math.round((7 + 0.03 * propagation) * 10) / 10);
}
