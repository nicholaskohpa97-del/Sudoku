// Replays a move log through the real game rules to check a claimed win and
// recompute its score. Used by the server before anything reaches the
// leaderboard, so the client never gets to say what it scored.
//
// This proves the log is a legal, consistent game that ends in a win, with
// human-plausible timing. It cannot prove who played it (the solution is in
// the browser for instant feedback), which is why implausibly fast games are
// rejected or flagged rather than trusted.
import {
  addTime,
  breakCombo,
  enter,
  eraseCell,
  newGameState,
  requestHint,
  scoreOf,
  setTrial,
  toggleNote,
  type MoveEvent,
} from "./game";

import { LIVES_OPTIONS, MAX_HINTS, type ScoreBreakdown } from "./scoring";
import type { Difficulty } from "./engine";
import { puzzleFromBase } from "./puzzles";

export const MAX_LOG_EVENTS = 1500;
const MAX_ELAPSED_MS = 6 * 3600_000;
/** Less than this per tap is not something a person can do. */
const REJECT_MS_PER_TAP = 250;
/** Less than this per tap is suspicious: kept off the boards. */
const FLAG_MS_PER_TAP = 600;

export interface VerifiedGame {
  /** The puzzle's identity: rebuilds the exact grid with `puzzleFromBase`. */
  baseId: string;
  seed: number;
  puzzle: string;
  solution: string;
  difficulty: Difficulty;
  rating: number;
  parMs: number;
  elapsedMs: number;
  lives: number;
  livesLost: number;
  hints: number;
  maxCombo: number;
  placements: number;
  score: ScoreBreakdown;
  /** Plausible but fast enough to keep off the public boards. */
  flagged: boolean;
}

export type VerifyResult = { ok: true; game: VerifiedGame } | { ok: false; reason: string };

const fail = (reason: string): VerifyResult => ({ ok: false, reason });

function isEvent(e: unknown): e is MoveEvent {
  if (!e || typeof e !== "object") return false;
  const { t, k, c, d } = e as Record<string, unknown>;
  return (
    typeof t === "number" &&
    Number.isFinite(t) &&
    t >= 0 &&
    typeof k === "string" &&
    ["place", "wrong", "note", "erase", "trial", "hint", "away"].includes(k) &&
    Number.isInteger(c) &&
    (c as number) >= 0 &&
    (c as number) <= 80 &&
    Number.isInteger(d) &&
    (d as number) >= 0 &&
    (d as number) <= 9
  );
}

export function verifyGame(input: { baseId: unknown; seed: unknown; log: unknown; lives: unknown }): VerifyResult {
  const { baseId, seed, log, lives } = input;
  if (typeof baseId !== "string" || typeof seed !== "number" || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    return fail("That isn't a valid puzzle");
  }
  // The puzzle is rebuilt from the bank, never taken from the client: no custom grids, and the rating is the official one.
  const dealt = puzzleFromBase(baseId, seed);
  if (!dealt) return fail("That puzzle isn't one of ours");
  if (!(LIVES_OPTIONS as readonly unknown[]).includes(lives)) return fail("Only games with 1–10 lives can be posted");
  if (!Array.isArray(log) || log.length === 0 || log.length > MAX_LOG_EVENTS || !log.every(isEvent)) return fail("The move log is missing or malformed");
  const events = log as MoveEvent[];
  for (let i = 1; i < events.length; i++) if (events[i].t < events[i - 1].t) return fail("The move log is out of order");

  const { puzzle, solution } = dealt;
  let g = newGameState(dealt, { lives: lives as number });
  let placements = 0;
  let taps = 0;
  for (const ev of events) {
    if (g.status !== "playing") return fail("The log continues after the game ended");
    g = addTime({ ...g, elapsedMs: 0 }, ev.t); // time as of this event
    switch (ev.k) {
      case "place":
      case "wrong": {
        const r = enter(g, ev.c, ev.d);
        const expected = ev.k === "place" ? "correct" : "wrong";
        if (r.outcome.kind !== expected) return fail("A move in the log doesn't match the puzzle");
        g = r.state;
        if (ev.k === "place") placements++;
        if (!ev.x) taps++;
        break;
      }
      case "note":
        g = toggleNote(g, ev.c, ev.d);
        taps++;
        break;
      case "erase":
        g = eraseCell(g, ev.c);
        taps++;
        break;
      case "trial":
        // d = 0 means the digit was cleared; toggling the current digit again clears it.
        g = setTrial(g, ev.c, ev.d === 0 ? g.trial[ev.c] : ev.d);
        taps++;
        break;
      case "hint": {
        if (g.hintsUsed >= MAX_HINTS) return fail("Too many hints in the log");
        const r = requestHint(g);
        if (!r.ok) return fail("A hint in the log wasn't available");
        g = r.state;
        break;
      }
      case "away":
        g = breakCombo(g);
        break;
    }
  }
  if (g.status !== "won") return fail("That game wasn't won");

  const elapsedMs = events[events.length - 1].t;
  if (elapsedMs > MAX_ELAPSED_MS) return fail("That game took too long to count");
  const perTap = elapsedMs / Math.max(1, taps);
  if (perTap < REJECT_MS_PER_TAP) return fail("That game was played faster than a person can");
  const score = scoreOf({ ...g, elapsedMs });
  return {
    ok: true,
    game: {
      puzzle,
      solution,
      baseId: dealt.baseId,
      seed: dealt.seed,
      difficulty: dealt.difficulty,
      rating: dealt.rating,
      parMs: dealt.parMs,
      elapsedMs,
      lives: lives as number,
      livesLost: g.livesLost,
      hints: g.hintsUsed,
      maxCombo: g.maxCombo,
      placements,
      score,
      flagged: perTap < FLAG_MS_PER_TAP,
    },
  };
}
