// Points: rewards harder puzzles, faster solves, fewer lives lost, fewer lives
// chosen up front, and unbroken streaks of correct entries. Pure functions, so
// the client shows exactly what the server will later verify.
//
//   Puzzle score = round( Σ cell shares × combo multiplier
//                         × time × lives used × lives chosen × hints ) + flawless bonus
//
// Each empty cell is worth Base(DR) ÷ empties, scaled by the combo multiplier
// in force when it was placed. Hints and lives lost lower the factors; any
// wrong entry, hint or trip out of the app also resets the combo.

/** Lives a player can choose before a game. 0 means unlimited (practice, no points). */
export const LIVES_OPTIONS = [1, 2, 3, 5, 7, 10] as const;
export const UNLIMITED_LIVES = 0;
export const DEFAULT_LIVES = 3;
export const MAX_HINTS = 3;

export function isValidLives(n: unknown): n is number {
  return n === UNLIMITED_LIVES || (LIVES_OPTIONS as readonly unknown[]).includes(n);
}

/** Points for a puzzle at Difficulty Rating `dr`: doubles every +1.5 DR. */
export function basePoints(dr: number): number {
  return Math.round(100 * Math.pow(2, (dr - 1) / 1.5));
}

/** In-puzzle combo multiplier for `count` consecutive correct entries. Not time-based. */
export function comboMultiplier(count: number): number {
  if (count >= 35) return 4;
  if (count >= 20) return 3;
  if (count >= 10) return 2;
  if (count >= 5) return 1.5;
  return 1;
}

/** Fewer lives chosen, more points. */
export const LIVES_CHOSEN_FACTOR: Record<number, number> = { 1: 1.5, 2: 1.25, 3: 1.0, 5: 0.8, 7: 0.65, 10: 0.5 };

export function livesChosenFactor(lives: number): number {
  return LIVES_CHOSEN_FACTOR[lives] ?? 0;
}

export const LIFE_LOST_PENALTY = 0.15;
export const LIFE_USE_FLOOR = 0.4;
export const HINT_PENALTY = 0.15;
export const TIME_FACTOR_MIN = 0.5;
export const TIME_FACTOR_MAX = 1.5;
export const FLAWLESS_BONUS_SHARE = 0.1;

export const livesUsedFactor = (lost: number) => Math.max(LIFE_USE_FLOOR, 1 - LIFE_LOST_PENALTY * lost);
export const hintFactor = (hints: number) => Math.max(0.1, 1 - HINT_PENALTY * hints);

/** Faster than par earns up to ×1.5, slower costs down to ×0.5. */
export function timeFactor(elapsedMs: number, parMs: number): number {
  if (elapsedMs <= 0) return TIME_FACTOR_MAX;
  return Math.min(TIME_FACTOR_MAX, Math.max(TIME_FACTOR_MIN, parMs / elapsedMs));
}

/** Multiplier for the nth consecutive clear in one session (1 = first). Capped. */
export function chainMultiplier(count: number): number {
  const ladder = [1, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.25, 2.5];
  return ladder[Math.min(Math.max(count, 0), ladder.length - 1)];
}

export interface ScoreInput {
  rating: number;
  parMs: number;
  empties: number;
  elapsedMs: number;
  lives: number;
  livesLost: number;
  hintsUsed: number;
  /** Σ over correct entries of their combo multiplier (see `cellShare`). */
  comboWeight: number;
}

export interface ScoreLine {
  label: string;
  value: string;
}

export interface ScoreBreakdown {
  base: number;
  /** Base scaled by combo: Σ base/empties × multiplier. */
  comboBase: number;
  time: number;
  livesUsed: number;
  livesChosen: number;
  hints: number;
  flawlessBonus: number;
  total: number;
  lines: ScoreLine[];
}

/** One correct entry's contribution to `comboWeight`. */
export const cellShare = (comboCount: number) => comboMultiplier(comboCount);

export function scorePuzzle(input: ScoreInput): ScoreBreakdown {
  const base = basePoints(input.rating);
  const comboBase = input.empties ? (base / input.empties) * input.comboWeight : base;
  const time = timeFactor(input.elapsedMs, input.parMs);
  const livesUsed = livesUsedFactor(input.livesLost);
  const livesChosen = livesChosenFactor(input.lives);
  const hints = hintFactor(input.hintsUsed);
  const flawless = input.livesLost === 0 && input.hintsUsed === 0;
  const flawlessBonus = flawless ? Math.round(base * FLAWLESS_BONUS_SHARE) : 0;
  const ranked = input.lives !== UNLIMITED_LIVES;
  const total = ranked ? Math.round(comboBase * time * livesUsed * livesChosen * hints) + flawlessBonus : 0;
  const x = (n: number) => `×${n.toFixed(2).replace(/\.?0+$/, "")}`;
  const lines: ScoreLine[] = [
    { label: `Puzzle value (rating ${input.rating.toFixed(1)})`, value: String(base) },
    { label: `Combo (${x(input.empties ? input.comboWeight / input.empties : 1)} avg)`, value: String(Math.round(comboBase)) },
    { label: "Speed vs par", value: x(time) },
    { label: `Lives lost (${input.livesLost})`, value: x(livesUsed) },
    { label: `Lives chosen (${input.lives === UNLIMITED_LIVES ? "∞" : input.lives})`, value: ranked ? x(livesChosen) : "practice" },
    { label: `Hints (${input.hintsUsed})`, value: x(hints) },
  ];
  if (flawlessBonus) lines.push({ label: "Flawless bonus", value: `+${flawlessBonus}` });
  return { base, comboBase, time, livesUsed, livesChosen, hints, flawlessBonus, total, lines };
}
