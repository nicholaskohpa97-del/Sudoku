// Progression rules: XP, levels, star ratings, the daily puzzle and
// achievements. Pure functions only, so they're shared and unit-tested;
// `lib/sudoku/profile.ts` persists the results on the device.
import type { Difficulty } from "./engine";

// ---------------------------------------------------------------------------
// XP and levels

export const XP_BASE: Record<Difficulty, number> = { beginner: 25, easy: 50, medium: 100, hard: 175, expert: 275, master: 450 };
export const FLAWLESS_XP_MULTIPLIER = 1.5;
export const COMBO_XP_PER_STEP = 5;
export const DAILY_XP_BONUS = 50;
export const ROOM_WIN_XP = 100;
export const ROOM_FINISH_XP = 40;

export { comboMultiplier } from "./scoring";

export interface XpLine {
  label: string;
  xp: number;
}

export function solveXp(input: { difficulty: Difficulty; mistakes: number; maxCombo: number; daily?: boolean }): {
  total: number;
  lines: XpLine[];
} {
  const base = XP_BASE[input.difficulty];
  const lines: XpLine[] = [{ label: "Solved", xp: base }];
  if (input.mistakes === 0) lines.push({ label: "Flawless", xp: Math.round(base * (FLAWLESS_XP_MULTIPLIER - 1)) });
  const combo = Math.min(input.maxCombo, 30) * COMBO_XP_PER_STEP;
  if (combo > 0) lines.push({ label: `Best combo ×${input.maxCombo}`, xp: combo });
  if (input.daily) lines.push({ label: "Daily puzzle", xp: DAILY_XP_BONUS });
  return { total: lines.reduce((s, l) => s + l.xp, 0), lines };
}

/** Total XP needed to reach `level` (level 1 starts at 0). Quadratic, so each level takes a bit longer. */
export function xpForLevel(level: number): number {
  return 50 * (level - 1) * (level - 1);
}

export const LEVEL_TITLES: { from: number; title: string }[] = [
  { from: 1, title: "Rookie" },
  { from: 3, title: "Number Cruncher" },
  { from: 6, title: "Grid Runner" },
  { from: 10, title: "Grid Ninja" },
  { from: 15, title: "Logic Wizard" },
  { from: 22, title: "Sudoku Sensei" },
  { from: 30, title: "Grandmaster" },
];

export function levelInfo(xp: number): { level: number; title: string; into: number; span: number; progress: number } {
  const level = Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
  const floor = xpForLevel(level);
  const span = xpForLevel(level + 1) - floor;
  const title = [...LEVEL_TITLES].reverse().find((t) => level >= t.from)!.title;
  return { level, title, into: xp - floor, span, progress: (xp - floor) / span };
}

// ---------------------------------------------------------------------------
// Star rating

/** "Par" solve times; beating par earns a star. */
export const PAR_MS: Record<Difficulty, number> = {
  beginner: 4 * 60_000,
  easy: 6 * 60_000,
  medium: 10 * 60_000,
  hard: 18 * 60_000,
  expert: 28 * 60_000,
  master: 40 * 60_000,
};

/** Stars from the puzzle's own par: 1 for solving, +1 for no lives lost or hints, +1 for beating par. */
export function starsForPar(parMs: number, livesLost: number, hints: number, elapsedMs: number): 1 | 2 | 3 {
  return (1 + (livesLost === 0 && hints === 0 ? 1 : 0) + (elapsedMs <= parMs ? 1 : 0)) as 1 | 2 | 3;
}

/** 1 star for solving, +1 for no mistakes, +1 for beating par. */
export function starsFor(difficulty: Difficulty, mistakes: number, elapsedMs: number): 1 | 2 | 3 {
  return (1 + (mistakes === 0 ? 1 : 0) + (elapsedMs <= PAR_MS[difficulty] ? 1 : 0)) as 1 | 2 | 3;
}

// ---------------------------------------------------------------------------
// Daily puzzle

export const DAILY_TZ = "Asia/Singapore";

/** Calendar day ("YYYY-MM-DD") in `tz`. */
export function dayKey(now: number = Date.now(), tz = DAILY_TZ): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(now),
  );
}

/** Whole days between two day keys (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Stable seed for a day, so everyone gets the same daily puzzle. */
export function dailySeed(key: string): number {
  let h = 2166136261;
  for (const ch of `sudoku-daily:${key}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Difficulty follows the week: gentle on Monday, Expert on Sunday. */
const WEEKLY: Difficulty[] = ["expert", "beginner", "easy", "medium", "hard", "medium", "hard"];

export function dailyDifficulty(key: string): Difficulty {
  const weekday = new Date(`${key}T00:00:00Z`).getUTCDay();
  return WEEKLY[weekday];
}

/** Streak after completing the daily for `today`. */
export function nextStreak(prev: { streak: number; lastDaily: string | null }, today: string): number {
  if (prev.lastDaily === today) return prev.streak;
  if (prev.lastDaily && daysBetween(prev.lastDaily, today) === 1) return prev.streak + 1;
  return 1;
}

/** Streak as displayed: it lapses once a whole day is missed. */
export function liveStreak(prev: { streak: number; lastDaily: string | null }, today: string): number {
  if (!prev.lastDaily) return 0;
  return daysBetween(prev.lastDaily, today) <= 1 ? prev.streak : 0;
}

// ---------------------------------------------------------------------------
// Achievements

export interface Progress {
  xp: number;
  /** Lifetime leaderboard points (puzzle score × clear-chain multiplier). */
  points: number;
  bestChain: number;
  solves: number;
  flawless: number;
  streak: number;
  bestStreak: number;
  lastDaily: string | null;
  roomWins: number;
  bestCombo: number;
  achievements: string[];
}

export function emptyProgress(): Progress {
  return {
    xp: 0,
    points: 0,
    bestChain: 0,
    solves: 0,
    flawless: 0,
    streak: 0,
    bestStreak: 0,
    lastDaily: null,
    roomWins: 0,
    bestCombo: 0,
    achievements: [],
  };
}

/** Facts about the event that just happened, used to unlock achievements. */
export interface ProgressEvent {
  solved?: { difficulty: Difficulty; mistakes: number; elapsedMs: number };
  unitsAtOnce?: number;
  roomWin?: boolean;
}

export const ACHIEVEMENTS: {
  id: string;
  emoji: string;
  name: string;
  description: string;
  test: (p: Progress, e: ProgressEvent) => boolean;
}[] = [
  { id: "first-solve", emoji: "🌱", name: "First Light", description: "Solve your first puzzle", test: (p) => p.solves >= 1 },
  {
    id: "flawless",
    emoji: "💎",
    name: "Flawless",
    description: "Solve a puzzle without a single mistake",
    test: (_, e) => e.solved?.mistakes === 0,
  },
  {
    id: "speedster",
    emoji: "⚡",
    name: "Speedster",
    description: "Solve any puzzle in under 5 minutes",
    test: (_, e) => !!e.solved && e.solved.elapsedMs < 5 * 60_000,
  },
  {
    id: "expert",
    emoji: "🧠",
    name: "Big Brain",
    description: "Solve an Expert puzzle",
    test: (_, e) => e.solved?.difficulty === "expert",
  },
  {
    id: "triple",
    emoji: "🎆",
    name: "Hat Trick",
    description: "Complete a row, column and box with one number",
    test: (_, e) => (e.unitsAtOnce ?? 0) >= 3,
  },
  { id: "combo-10", emoji: "🔥", name: "On Fire", description: "Reach a ×10 combo", test: (p) => p.bestCombo >= 10 },
  { id: "streak-7", emoji: "📅", name: "Habit Forming", description: "Keep a 7-day daily streak", test: (p) => p.bestStreak >= 7 },
  { id: "room-win", emoji: "🏆", name: "Champion", description: "Win a multiplayer race", test: (p) => p.roomWins >= 1 },
  { id: "solves-25", emoji: "🧩", name: "Puzzle Addict", description: "Solve 25 puzzles", test: (p) => p.solves >= 25 },
];

/** Achievements newly unlocked by `event`, given progress already updated for it. */
export function unlockedBy(progress: Progress, event: ProgressEvent): string[] {
  return ACHIEVEMENTS.filter((a) => !progress.achievements.includes(a.id) && a.test(progress, event)).map((a) => a.id);
}
