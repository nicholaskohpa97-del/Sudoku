"use client";

// Device-local progression (XP, streaks, achievements). Like the player
// identity, it lives in localStorage until accounts arrive.
import { useMemo, useSyncExternalStore } from "react";
import type { Difficulty } from "./engine";
import {
  dayKey,
  emptyProgress,
  levelInfo,
  nextStreak,
  ROOM_FINISH_XP,
  ROOM_WIN_XP,
  solveXp,
  unlockedBy,
  type Progress,
  type XpLine,
} from "./progress";

const PROGRESS_KEY = "sudoku.progress.v1";
const AWARDED_ROOMS_KEY = "sudoku.awardedRooms.v1";
const EVENT = "sudoku-progress";

function load(): Progress {
  return parse(raw());
}

function save(p: Progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    // Ignore storage failures.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function raw(): string {
  try {
    return localStorage.getItem(PROGRESS_KEY) ?? "{}";
  } catch {
    return "{}";
  }
}

function parse(r: string): Progress {
  try {
    return { ...emptyProgress(), ...JSON.parse(r) };
  } catch {
    return emptyProgress();
  }
}

/** The device's progression; `null` during SSR and hydration. */
export function useProgress(): Progress | null {
  const r = useSyncExternalStore(subscribe, raw, () => null);
  return useMemo(() => (r === null ? null : parse(r)), [r]);
}

export interface Award {
  xp: number;
  /** Leaderboard points banked for this solve (after the chain multiplier). */
  points: number;
  lines: XpLine[];
  levelBefore: number;
  xpBefore: number;
  xpAfter: number;
  unlocked: string[];
  streak: number;
}

function apply(lines: XpLine[], mutate: (p: Progress) => void, event: Parameters<typeof unlockedBy>[1]): Award {
  const p = load();
  const xpBefore = p.xp;
  const xp = lines.reduce((s, l) => s + l.xp, 0);
  p.xp += xp;
  mutate(p);
  const unlocked = unlockedBy(p, event);
  p.achievements = [...p.achievements, ...unlocked];
  save(p);
  return {
    xp,
    lines,
    levelBefore: levelInfo(xpBefore).level,
    xpBefore,
    xpAfter: p.xp,
    points: 0,
    unlocked,
    streak: p.streak,
  };
}

export function awardSolve(input: {
  difficulty: Difficulty;
  /** Lives lost. */
  mistakes: number;
  elapsedMs: number;
  maxCombo: number;
  daily?: boolean;
  /** Points banked after the chain multiplier (0 in practice mode). */
  points?: number;
  chainCount?: number;
}): Award {
  const { lines } = solveXp(input);
  const today = dayKey();
  const award = apply(
    lines,
    (p) => {
      p.points += input.points ?? 0;
      p.bestChain = Math.max(p.bestChain, input.chainCount ?? 0);
      p.solves += 1;
      if (input.mistakes === 0) p.flawless += 1;
      p.bestCombo = Math.max(p.bestCombo, input.maxCombo);
      if (input.daily) {
        p.streak = nextStreak(p, today);
        p.lastDaily = today;
        p.bestStreak = Math.max(p.bestStreak, p.streak);
      }
    },
    { solved: input },
  );
  return { ...award, points: input.points ?? 0 };
}

/** Records a moment during play (combo peak, multi-unit clear) that can unlock achievements. */
export function recordMoment(input: { combo?: number; unitsAtOnce?: number }): string[] {
  return apply(
    [],
    (p) => {
      if (input.combo) p.bestCombo = Math.max(p.bestCombo, input.combo);
    },
    { unitsAtOnce: input.unitsAtOnce },
  ).unlocked;
}

/** XP for a finished room round, at most once per room round on this device. */
export function awardRoom(roomKey: string, result: { won: boolean; finished: boolean }): Award | null {
  let awarded: string[] = [];
  try {
    awarded = JSON.parse(localStorage.getItem(AWARDED_ROOMS_KEY) ?? "[]");
  } catch {
    awarded = [];
  }
  if (awarded.includes(roomKey)) return null;
  try {
    localStorage.setItem(AWARDED_ROOMS_KEY, JSON.stringify([...awarded.slice(-49), roomKey]));
  } catch {
    // Ignore storage failures.
  }
  const lines: XpLine[] = [];
  if (result.finished) lines.push({ label: "Finished the race", xp: ROOM_FINISH_XP });
  if (result.won) lines.push({ label: "Race winner", xp: ROOM_WIN_XP });
  if (!lines.length) return null;
  return apply(
    lines,
    (p) => {
      if (result.won) p.roomWins += 1;
      if (result.finished) p.solves += 1;
    },
    { roomWin: result.won },
  );
}
