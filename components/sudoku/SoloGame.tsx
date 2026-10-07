"use client";

import { CalendarDays, RotateCcw, Sparkles, Timer } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDuration } from "@/lib/sudoku/client";
import {
  DIFFICULTIES,
  DIFFICULTY_CONFIG,
  MAX_MISTAKES,
  type Difficulty,
} from "@/lib/sudoku/engine";
import { awardSolve, type Award } from "@/lib/sudoku/profile";
import { generatePuzzle } from "@/lib/sudoku/puzzles";
import { dailyDifficulty, dailySeed, dayKey, starsFor } from "@/lib/sudoku/progress";
import { sfx } from "@/lib/sudoku/sfx";
import { recordSoloResult } from "@/lib/sudoku/stats";
import { Board, type CellState } from "./Board";
import { MistakeMeter, NumberPad, useBoardKeys } from "./Controls";
import { ComboMeter, useJuice } from "./juice";
import { DIFFICULTY_STYLE } from "./theme";
import { BackLink, buttonStyles, clearPeerNotes, Toast, useIsClient, useToast } from "./ui";
import { VictoryCard } from "./Victory";

interface SoloState {
  difficulty: Difficulty;
  seed: number;
  puzzle: string;
  solution: string;
  /** Player entries, including wrong ones (shown in red until replaced). */
  values: number[];
  notes: number[];
  mistakes: number;
  elapsedMs: number;
  status: "playing" | "won" | "lost";
  /** Day key when this is the daily puzzle. */
  daily?: string;
}

export type SoloMode = { kind: "classic"; difficulty: Difficulty } | { kind: "daily" };

export const SAVE_KEY = "sudoku.solo.v1";
const DAILY_SAVE_KEY = "sudoku.daily.v1";
const DAILY_DONE_KEY = "sudoku.dailyDone.v1";

function newGame(difficulty: Difficulty, seed?: number, daily?: string): SoloState {
  const p = generatePuzzle(difficulty, seed);
  return {
    difficulty,
    seed: p.seed,
    puzzle: p.puzzle,
    solution: p.solution,
    values: Array.from(p.puzzle, Number),
    notes: new Array(81).fill(0),
    mistakes: 0,
    elapsedMs: 0,
    status: "playing",
    daily,
  };
}

function newDaily(): SoloState {
  const key = dayKey();
  return newGame(dailyDifficulty(key), dailySeed(key), key);
}

/** The saved classic game, if one is in progress (used by the hub's "Continue"). */
export function loadSavedGame(): SoloState | null {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null") as SoloState | null;
    return saved && saved.status === "playing" ? saved : null;
  } catch {
    return null;
  }
}

/** Day key of the last daily puzzle solved on this device. */
export function loadDailyDone(): string | null {
  try {
    return localStorage.getItem(DAILY_DONE_KEY);
  } catch {
    return null;
  }
}

function loadOrCreate(mode: SoloMode): SoloState {
  try {
    if (mode.kind === "daily") {
      const saved = JSON.parse(localStorage.getItem(DAILY_SAVE_KEY) ?? "null") as SoloState | null;
      if (saved && saved.daily === dayKey()) return saved;
      return newDaily();
    }
    const saved = loadSavedGame();
    if (saved && saved.difficulty === mode.difficulty && !saved.daily) return saved;
  } catch {
    // Corrupt or unavailable storage: start fresh.
  }
  return mode.kind === "daily" ? newDaily() : newGame(mode.difficulty);
}

/** Only the correct digits, "0" elsewhere: what unit-completion checks need. */
function correctBoard(values: number[], solution: string): string {
  return values.map((v, k) => (String(v) === solution[k] ? solution[k] : "0")).join("");
}

export function SoloGame({ mode }: { mode: SoloMode }) {
  // The puzzle is random and may be resumed from localStorage, so render it
  // on the client only to avoid a hydration mismatch.
  const isClient = useIsClient();
  if (!isClient) return <div className="mx-auto aspect-square w-full max-w-[min(92vw,30rem)]" />;
  return <SoloGameInner key={mode.kind === "daily" ? "daily" : mode.difficulty} mode={mode} />;
}

function SoloGameInner({ mode }: { mode: SoloMode }) {
  const [game, setGame] = useState<SoloState>(() => loadOrCreate(mode));
  const [selected, setSelected] = useState<number | null>(null);
  const [notesMode, setNotesMode] = useState(false);
  const [flash, setFlash] = useState<{ index: number; key: number } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [award, setAward] = useState<Award | null>(null);
  const [showResult, setShowResult] = useState(game.status !== "playing");
  const { toast, show } = useToast();
  const juice = useJuice((text) => show(text, "success"));
  const isDaily = !!game.daily;
  const difficulty = game.difficulty;
  const style = DIFFICULTY_STYLE[difficulty];

  // Persist on every change so a refresh resumes the same game.
  useEffect(() => {
    try {
      localStorage.setItem(isDaily ? DAILY_SAVE_KEY : SAVE_KEY, JSON.stringify(game));
    } catch {
      // Ignore storage failures.
    }
  }, [game, isDaily]);

  // Timer: ticks while playing and the tab is visible.
  const playing = game.status === "playing";
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") setGame((g) => ({ ...g, elapsedMs: g.elapsedMs + 1000 }));
    }, 1000);
    return () => clearInterval(id);
  }, [playing]);

  const cells: CellState[] = useMemo(
    () =>
      game.values.map((value, i) => {
        const shown = revealed && game.status === "lost" ? Number(game.solution[i]) : value;
        return {
          value: shown,
          given: game.puzzle[i] !== "0",
          wrong: shown !== 0 && String(shown) !== game.solution[i],
          notes: game.notes[i],
        };
      }),
    [game, revealed],
  );

  const enter = useCallback(
    (n: number) => {
      if (selected === null || game.status !== "playing" || game.puzzle[selected] !== "0") return;
      const i = selected;
      const correctNow = String(game.values[i]) === game.solution[i];
      if (correctNow) return;

      if (notesMode) {
        sfx.tap();
        setGame((g) => {
          const values = g.values.slice();
          values[i] = 0;
          const notes = g.notes.slice();
          notes[i] ^= 1 << n;
          return { ...g, values, notes };
        });
        return;
      }

      if (String(n) === game.solution[i]) {
        const values = game.values.slice();
        values[i] = n;
        const won = values.every((v, k) => String(v) === game.solution[k]);
        setGame({ ...game, values, notes: clearPeerNotes(game.notes, i, n), status: won ? "won" : "playing" });
        const { combo } = juice.correct(correctBoard(values, game.solution), i);
        if (won) {
          recordSoloResult(game.difficulty, true, game.elapsedMs);
          if (game.daily) {
            try {
              localStorage.setItem(DAILY_DONE_KEY, game.daily);
            } catch {
              // Ignore storage failures.
            }
          }
          const result = awardSolve({
            difficulty: game.difficulty,
            mistakes: game.mistakes,
            elapsedMs: game.elapsedMs,
            maxCombo: Math.max(juice.maxCombo.current, combo),
            daily: !!game.daily,
          });
          setAward(result);
          setSelected(null);
          setTimeout(() => juice.celebrate(i), 350);
          setTimeout(() => setShowResult(true), 1900);
        }
        return;
      }

      // Wrong number: keep it on the board in red and count the mistake.
      const mistakes = game.mistakes + 1;
      const values = game.values.slice();
      values[i] = n;
      const lost = mistakes >= MAX_MISTAKES;
      setGame({ ...game, values, mistakes, status: lost ? "lost" : "playing" });
      setFlash({ index: i, key: Date.now() });
      juice.wrong();
      if (lost) {
        recordSoloResult(game.difficulty, false, game.elapsedMs);
        sfx.lose();
        setTimeout(() => setShowResult(true), 700);
      }
      show(
        lost ? `${n} is wrong. Out of lives!` : `Not ${n}! ${MAX_MISTAKES - mistakes} ${MAX_MISTAKES - mistakes === 1 ? "life" : "lives"} left`,
        "error",
      );
    },
    [game, notesMode, selected, show, juice],
  );

  const erase = useCallback(() => {
    if (selected === null || game.status !== "playing" || game.puzzle[selected] !== "0") return;
    if (String(game.values[selected]) === game.solution[selected]) return;
    setGame((g) => {
      const values = g.values.slice();
      const notes = g.notes.slice();
      values[selected] = 0;
      notes[selected] = 0;
      return { ...g, values, notes };
    });
  }, [game, selected]);

  const toggleNotes = useCallback(() => setNotesMode((m) => !m), []);

  useBoardKeys({
    enabled: game.status === "playing",
    selected,
    setSelected,
    onNumber: enter,
    onErase: erase,
    onToggleNotes: toggleNotes,
  });

  const restart = (sameSeed: boolean) => {
    setGame(isDaily && sameSeed ? newDaily() : newGame(difficulty, sameSeed ? game.seed : undefined));
    setSelected(null);
    setRevealed(false);
    setAward(null);
    setShowResult(false);
    juice.reset();
  };

  const filled = game.values.filter((v, i) => game.puzzle[i] === "0" && String(v) === game.solution[i]).length;
  const toFill = [...game.puzzle].filter((c) => c === "0").length;

  let overlay: React.ReactNode = null;
  if (game.status === "won" && showResult) {
    overlay = (
      <VictoryCard
        title={isDaily ? "Daily cleared!" : "Solved!"}
        subtitle={`${DIFFICULTY_CONFIG[difficulty].label} · ${formatDuration(game.elapsedMs)} · ${game.mistakes} ${game.mistakes === 1 ? "mistake" : "mistakes"}`}
        stars={starsFor(difficulty, game.mistakes, game.elapsedMs)}
        award={award}
      >
        {isDaily ? (
          <Link href="/sudoku" className={buttonStyles.primary}>
            Back to hub
          </Link>
        ) : (
          <button type="button" onClick={() => restart(false)} className={buttonStyles.primary}>
            <Sparkles className="size-4" /> Next puzzle
          </button>
        )}
      </VictoryCard>
    );
  } else if (game.status === "lost" && !revealed && showResult) {
    overlay = (
      <div className="space-y-4 px-6 text-center">
        <p className="text-5xl">💔</p>
        <h2 className="font-display text-4xl font-bold text-rose-300">Out of lives</h2>
        <p className="text-sm font-semibold text-stone-300">
          {filled}/{toFill} cells solved. So close. Go again?
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => restart(true)} className={buttonStyles.primary}>
            <RotateCcw className="size-4" /> Retry
          </button>
          {!isDaily ? (
            <button type="button" onClick={() => restart(false)} className={buttonStyles.secondary}>
              New puzzle
            </button>
          ) : null}
          <button type="button" onClick={() => setRevealed(true)} className={buttonStyles.secondary}>
            Show solution
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink />
        {isDaily ? (
          <span className="flex items-center gap-2 rounded-full border border-pink-300/40 bg-pink-400/10 px-3 py-1.5 font-display text-sm font-semibold text-pink-200">
            <CalendarDays className="size-4" /> Daily · <span className={style.text}>{DIFFICULTY_CONFIG[difficulty].label}</span>
          </span>
        ) : (
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-full border border-white/10 bg-white/[0.03] p-1 text-xs [scrollbar-width:none]">
            {DIFFICULTIES.map((d) => (
              <Link
                key={d}
                href={`/sudoku/play/${d}`}
                aria-current={d === difficulty ? "page" : undefined}
                ref={d === difficulty ? (el) => el?.scrollIntoView({ inline: "center", block: "nearest" }) : undefined}
                className={`shrink-0 rounded-full px-3 py-1 font-display font-semibold transition ${d === difficulty ? DIFFICULTY_STYLE[d].chip : "text-stone-400 hover:text-stone-100"}`}
              >
                {DIFFICULTY_CONFIG[d].label}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="mx-auto grid w-full max-w-[min(92vw,30rem)] grid-cols-3 items-center text-sm">
        <MistakeMeter mistakes={game.mistakes} />
        <div className="flex justify-center">
          <ComboMeter combo={juice.combo} />
        </div>
        <div className="flex items-center justify-end gap-3 font-num font-semibold tabular-nums">
          <span className="text-stone-400">
            {filled}/{toFill}
          </span>
          <span className="flex items-center gap-1 text-stone-100">
            <Timer className="size-4 text-cyan-300" /> {formatDuration(game.elapsedMs)}
          </span>
        </div>
      </div>

      <div className="mx-auto h-1.5 w-full max-w-[min(92vw,30rem)] overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-pink-400 shadow-[0_0_12px_rgb(34_211_238/0.7)] transition-all duration-500"
          style={{ width: `${toFill ? (filled / toFill) * 100 : 0}%` }}
        />
      </div>

      <Board
        cells={cells}
        selected={selected}
        onSelect={(i) => {
          setSelected(i);
        }}
        flash={flash}
        effects={juice.effects}
        overlay={overlay}
      />

      <NumberPad
        cells={cells}
        notesMode={notesMode}
        disabled={game.status !== "playing"}
        onNumber={enter}
        onErase={erase}
        onToggleNotes={toggleNotes}
      />

      {game.status === "lost" && revealed ? (
        <div className="flex justify-center gap-2">
          <button type="button" onClick={() => restart(true)} className={buttonStyles.primary}>
            <RotateCcw className="size-4" /> Retry
          </button>
          {!isDaily ? (
            <button type="button" onClick={() => restart(false)} className={buttonStyles.secondary}>
              New puzzle
            </button>
          ) : null}
        </div>
      ) : null}

      <Toast toast={toast} />
    </div>
  );
}
