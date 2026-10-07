// The solo game as a pure state machine. The UI calls these functions and
// renders the result; tests drive them directly.
//
// Three ways to enter a number:
//   pen    commit straight away; a wrong digit costs a life and shows in red.
//   notes  small multi-candidate pencil marks (no checking).
//   trial  "pencil trial": ONE tentative digit per cell, never checked. It is
//          committed later (one cell or all), and only then does a wrong digit
//          cost a life. The clock keeps running, so trial and error costs time.
import { hintLevels, type HintLevel } from "./explain";
import { generatePuzzle } from "./puzzles";
import { colOf, rowOf, boxOf, PEERS, type Difficulty, type Puzzle } from "./engine";
import { cellShare, MAX_HINTS, scorePuzzle, UNLIMITED_LIVES, type ScoreBreakdown } from "./scoring";
import { applyStep, eliminate, nextStep, stateFromGrid, type State } from "./solver";
import type { Step } from "./solver/types";

export type InputMode = "pen" | "notes" | "trial";
export type GameStatus = "playing" | "won" | "lost" | "revealed";
export type GameKind = "classic" | "daily";

export interface ActiveHint {
  step: Step;
  level: 1 | 2 | 3;
  /** Log length when this level was delivered; later placements close an elimination hint. */
  at: number;
}

export type MoveKind = "place" | "wrong" | "note" | "erase" | "trial" | "hint";

/** One logged action; the strategy report and (later) score verification replay these. */
export interface MoveEvent {
  /** Active play time in ms when it happened. */
  t: number;
  k: MoveKind;
  c: number;
  d: number;
  /** Set when a place/wrong came from committing a pencil trial. */
  x?: 1;
}

export interface GameState {
  v: 2;
  id: string;
  kind: GameKind;
  difficulty: Difficulty;
  seed: number;
  puzzle: string;
  solution: string;
  rating: number;
  parMs: number;
  baseId: string;
  /** Day key when this is the daily puzzle. */
  daily?: string;
  /** Lives chosen up front; 0 = unlimited (practice, scores nothing). */
  lives: number;
  livesLost: number;
  /** Committed entries, including wrong ones (shown in red until replaced). */
  values: number[];
  /** Multi-candidate pencil marks (bitmask per cell). */
  notes: number[];
  /** Tentative single digit per cell (pencil trial); 0 = none. */
  trial: number[];
  elapsedMs: number;
  status: GameStatus;
  /** Consecutive correct entries (not time-based). */
  combo: number;
  maxCombo: number;
  /** Σ combo multipliers of correct entries; feeds the score. */
  comboWeight: number;
  hintsUsed: number;
  hint: ActiveHint | null;
  /** Candidates (cell * 10 + digit) already ruled out by delivered hints. */
  hintElims: number[];
  log: MoveEvent[];
  startedAt: number;
}

const MAX_LOG = 1500;

export function randomId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function newGameState(
  puzzle: Puzzle,
  opts: { lives: number; kind?: GameKind; daily?: string; now?: number },
): GameState {
  return {
    v: 2,
    id: randomId(),
    kind: opts.kind ?? "classic",
    difficulty: puzzle.difficulty,
    seed: puzzle.seed,
    puzzle: puzzle.puzzle,
    solution: puzzle.solution,
    rating: puzzle.rating,
    parMs: puzzle.parMs,
    baseId: puzzle.baseId,
    daily: opts.daily,
    lives: opts.lives,
    livesLost: 0,
    values: Array.from(puzzle.puzzle, Number),
    notes: new Array(81).fill(0),
    trial: new Array(81).fill(0),
    elapsedMs: 0,
    status: "playing",
    combo: 0,
    maxCombo: 0,
    comboWeight: 0,
    hintsUsed: 0,
    hint: null,
    hintElims: [],
    log: [],
    startedAt: opts.now ?? Date.now(),
  };
}

/** A fresh puzzle of `difficulty`, skipping bank puzzles the player has already given up on. */
export function freshGame(
  difficulty: Difficulty,
  lives: number,
  exclude?: ReadonlySet<string>,
  seed?: number,
): GameState {
  return newGameState(generatePuzzle(difficulty, seed, exclude), { lives });
}

export const emptiesOf = (g: GameState) => [...g.puzzle].filter((c) => c === "0").length;
export const isCorrectAt = (g: GameState, cell: number) => String(g.values[cell]) === g.solution[cell];
export const isGiven = (g: GameState, cell: number) => g.puzzle[cell] !== "0";
export const filledCount = (g: GameState) => g.values.filter((v, i) => g.puzzle[i] === "0" && String(v) === g.solution[i]).length;
export const isRanked = (g: GameState) => g.lives !== UNLIMITED_LIVES;
export const livesLeft = (g: GameState) => (g.lives === UNLIMITED_LIVES ? Infinity : Math.max(0, g.lives - g.livesLost));

/** Only the correct digits, "0" elsewhere: givens plus correct entries. */
export function correctBoard(g: GameState): string {
  return g.values.map((v, k) => (String(v) === g.solution[k] ? g.solution[k] : "0")).join("");
}

function log(g: GameState, k: MoveKind, c: number, d: number): MoveEvent[] {
  const next = g.log.length >= MAX_LOG ? g.log.slice(g.log.length - MAX_LOG + 1) : g.log.slice();
  next.push({ t: g.elapsedMs, k, c, d });
  return next;
}

/** Removes `digit` from the notes of every peer of `cell`. */
export function clearPeerNotes(notes: number[], cell: number, digit: number): number[] {
  const out = notes.slice();
  const mask = ~(1 << digit);
  out[cell] = 0;
  for (const p of PEERS[cell]) out[p] &= mask;
  return out;
}

export type EntryOutcome =
  | { kind: "ignored" }
  | { kind: "correct"; cell: number; digit: number; combo: number; won: boolean }
  | { kind: "wrong"; cell: number; digit: number; lost: boolean };

const canEdit = (g: GameState, cell: number) =>
  g.status === "playing" && !isGiven(g, cell) && !isCorrectAt(g, cell);

/** Pen entry: committed and checked at once. */
export function enter(g: GameState, cell: number, digit: number): { state: GameState; outcome: EntryOutcome } {
  if (!canEdit(g, cell)) return { state: g, outcome: { kind: "ignored" } };
  const values = g.values.slice();
  values[cell] = digit;
  const trial = g.trial.slice();
  trial[cell] = 0;

  if (String(digit) === g.solution[cell]) {
    const combo = g.combo + 1;
    const won = values.every((v, k) => String(v) === g.solution[k]);
    const state: GameState = {
      ...g,
      values,
      trial,
      notes: clearPeerNotes(g.notes, cell, digit),
      combo,
      maxCombo: Math.max(g.maxCombo, combo),
      comboWeight: g.comboWeight + cellShare(combo),
      status: won ? "won" : "playing",
      log: log(g, "place", cell, digit),
    };
    return { state, outcome: { kind: "correct", cell, digit, combo, won } };
  }

  const livesLost = g.livesLost + 1;
  const lost = g.lives !== UNLIMITED_LIVES && livesLost >= g.lives;
  const state: GameState = {
    ...g,
    values,
    trial,
    livesLost,
    combo: 0,
    status: lost ? "lost" : "playing",
    log: log(g, "wrong", cell, digit),
  };
  return { state, outcome: { kind: "wrong", cell, digit, lost } };
}

export function toggleNote(g: GameState, cell: number, digit: number): GameState {
  if (!canEdit(g, cell)) return g;
  const values = g.values.slice();
  values[cell] = 0; // a note replaces a wrong digit that was showing in red
  const notes = g.notes.slice();
  notes[cell] ^= 1 << digit;
  return { ...g, values, notes, log: log(g, "note", cell, digit) };
}

/** Pencil trial: one tentative digit per cell. Same digit again clears it. No checking. */
export function setTrial(g: GameState, cell: number, digit: number): GameState {
  if (!canEdit(g, cell)) return g;
  const trial = g.trial.slice();
  const clearing = trial[cell] === digit;
  trial[cell] = clearing ? 0 : digit;
  const values = g.values.slice();
  values[cell] = 0; // trying a digit replaces a wrong committed one
  return { ...g, trial, values, log: log(g, "trial", cell, clearing ? 0 : digit) };
}

export function eraseCell(g: GameState, cell: number): GameState {
  if (!canEdit(g, cell)) return g;
  const values = g.values.slice();
  const notes = g.notes.slice();
  const trial = g.trial.slice();
  values[cell] = 0;
  notes[cell] = 0;
  trial[cell] = 0;
  return { ...g, values, notes, trial, log: log(g, "erase", cell, 0) };
}

export const trialCells = (g: GameState) => g.trial.map((d, i) => (d ? i : -1)).filter((i) => i >= 0);

/**
 * Commits tentative digits (all of them by default) in reading order, as if
 * each had been entered with the pen. Stops as soon as the game ends.
 */
export function commitTrials(g: GameState, cells: number[] = trialCells(g)): { state: GameState; outcomes: EntryOutcome[] } {
  let state = g;
  const outcomes: EntryOutcome[] = [];
  for (const cell of [...cells].sort((a, b) => a - b)) {
    const digit = state.trial[cell];
    if (!digit || state.status !== "playing") continue;
    const r = enter(state, cell, digit);
    state = r.state;
    if (r.outcome.kind !== "ignored") {
      const last = state.log.length - 1;
      state = { ...state, log: state.log.map((e, i) => (i === last ? { ...e, x: 1 as const } : e)) };
    }
    outcomes.push(r.outcome);
  }
  return { state, outcomes };
}

export function clearTrials(g: GameState): GameState {
  return g.trial.some(Boolean) ? { ...g, trial: new Array(81).fill(0) } : g;
}

export function addTime(g: GameState, ms: number): GameState {
  return g.status === "playing" ? { ...g, elapsedMs: g.elapsedMs + ms } : g;
}

/** Resets the in-puzzle combo (leaving the app, a hint). */
export function breakCombo(g: GameState): GameState {
  return g.combo === 0 ? g : { ...g, combo: 0 };
}

/** Gives up: the puzzle is revealed, scores nothing and can't be replayed. */
export function reveal(g: GameState): GameState {
  if (g.status === "won" || g.status === "revealed") return g;
  return { ...g, status: "revealed", combo: 0, trial: new Array(81).fill(0) };
}

// ---------------------------------------------------------------------------
// Hints (up to MAX_HINTS per game, each press escalates the current step)

export const hintsLeft = (g: GameState) => MAX_HINTS - g.hintsUsed;

function hintState(g: GameState): State {
  const s = stateFromGrid(correctBoard(g));
  for (const n of g.hintElims) eliminate(s, Math.floor(n / 10), n % 10);
  return s;
}

function stepResolved(g: GameState, h: ActiveHint): boolean {
  if (h.step.placements.length) return h.step.placements.every((p) => String(g.values[p.cell]) === String(p.digit));
  return h.level === 3; // an elimination step has nothing more to reveal
}

export interface HintView extends HintLevel {
  level: 1 | 2 | 3;
  technique: string;
}

export type HintResult =
  | { ok: true; state: GameState; view: HintView }
  | { ok: false; reason: "none-left" | "not-playing" | "full" | "no-step" };

/** True while the hint should still be on screen. */
export function hintOpen(g: GameState): boolean {
  const h = g.hint;
  if (!h || g.status !== "playing") return false;
  if (h.step.placements.length) return !stepResolved(g, h);
  return !g.log.slice(h.at).some((e) => e.k === "place");
}

export function hintView(g: GameState): HintView | null {
  if (!g.hint) return null;
  const levels = hintLevels(g.hint.step, hintState(g));
  return { ...levels[g.hint.level - 1], level: g.hint.level, technique: g.hint.step.technique };
}

/**
 * Spends one hint. Pressing again on a step that is still open reveals more
 * of it (level 1 → 2 → 3); once it is done, the next press starts the next
 * logical step. A hint resets the combo.
 */
export function requestHint(g: GameState): HintResult {
  if (g.status !== "playing") return { ok: false, reason: "not-playing" };
  if (g.hintsUsed >= MAX_HINTS) return { ok: false, reason: "none-left" };

  let hint = g.hint;
  let hintElims = g.hintElims;
  if (hint && !stepResolved(g, hint)) {
    if (hint.level === 3) return { ok: false, reason: "full" };
    hint = { step: hint.step, level: (hint.level + 1) as 2 | 3, at: 0 };
  } else {
    const s = hintState(g);
    const step = nextStep(s);
    if (!step) return { ok: false, reason: "no-step" };
    hint = { step, level: 1, at: 0 };
    hintElims = [...hintElims, ...step.eliminations.map((e) => e.cell * 10 + e.digit)];
  }
  const nextLog = log(g, "hint", hint.step.pattern[0] ?? 0, hint.level);
  const state: GameState = {
    ...g,
    hint: { ...hint, at: nextLog.length },
    hintElims,
    hintsUsed: g.hintsUsed + 1,
    combo: 0,
    log: nextLog,
  };
  return { ok: true, state, view: hintView(state)! };
}

// ---------------------------------------------------------------------------
// Result

export function scoreOf(g: GameState): ScoreBreakdown {
  return scorePuzzle({
    rating: g.rating,
    parMs: g.parMs,
    empties: emptiesOf(g),
    elapsedMs: g.elapsedMs,
    lives: g.lives,
    livesLost: g.livesLost,
    hintsUsed: g.hintsUsed,
    comboWeight: g.comboWeight,
  });
}

/** Cells (by index) that share a unit with `cell`, for UI highlighting. */
export const sharesUnit = (a: number, b: number) =>
  rowOf(a) === rowOf(b) || colOf(a) === colOf(b) || boxOf(a) === boxOf(b);

void applyStep;
