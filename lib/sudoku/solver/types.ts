// Shared types for the human-technique solver.

export type TechniqueId =
  | "full-house"
  | "hidden-single"
  | "naked-single"
  | "pointing"
  | "claiming"
  | "naked-pair"
  | "hidden-pair"
  | "naked-triple"
  | "hidden-triple"
  | "naked-quad"
  | "hidden-quad"
  | "x-wing"
  | "swordfish"
  | "jellyfish"
  | "skyscraper"
  | "two-string-kite"
  | "turbot-fish"
  | "xy-wing"
  | "xyz-wing"
  | "w-wing"
  | "unique-rectangle-1"
  | "unique-rectangle-2"
  | "unique-rectangle-4"
  | "simple-coloring"
  | "x-chain"
  | "xy-chain"
  | "aic"
  | "nishio"
  | "cell-forcing"
  | "region-forcing"
  | "trial-and-error";

export interface Placement {
  cell: number;
  digit: number;
}

export interface Step {
  technique: TechniqueId;
  /** Difficulty weight of this step (see `techniques.ts`). */
  weight: number;
  placements: Placement[];
  /** Candidates this step removes (for placements, the implied peer clean-up is not listed). */
  eliminations: Placement[];
  /** Cells forming the pattern, for highlighting. */
  pattern: number[];
  /** Digits the pattern is about. */
  digits: number[];
  /** Units (0–8 rows, 9–17 columns, 18–26 boxes) the pattern lives in. */
  units: number[];
  /** Technique-specific extras used to explain the step. */
  detail?: StepDetail;
}

export interface StepDetail {
  /** Hidden/naked single or locked candidates: the unit that decides it. */
  unit?: number;
  /** Pointing/claiming: the line (or box) the digit is confined to. */
  lockedIn?: number;
  /** Wings: the pivot cell. */
  pivot?: number;
  /** Wings: the pincer cells. */
  pincers?: number[];
  /** Fish: base lines. */
  base?: number[];
  /** Fish: cover lines. */
  cover?: number[];
  /** Chains: candidate nodes (cell * 10 + digit) in order. */
  chain?: number[];
  /** Coloring: the two colour classes. */
  colors?: [number[], number[]];
  /** Forcing: the assumption that was tested, as a node (cell * 10 + digit). */
  assumption?: number;
  /** Forcing: how many singles it took to reach the contradiction or conclusion. */
  propagation?: number;
  /** Anything else worth carrying (e.g. which UR type, rule used). */
  note?: string;
}

export interface TechniqueInfo {
  name: string;
  family: "singles" | "locked" | "subsets" | "fish" | "wings" | "single-digit" | "uniqueness" | "chains" | "forcing";
  /** Nominal weight (chains and forcing add to it by length). */
  weight: number;
  blurb: string;
}
