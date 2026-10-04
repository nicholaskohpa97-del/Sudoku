"use client";

import { RotateCcw, Sparkles, Timer, Trophy } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDuration } from "@/lib/sudoku/client";
import {
  DIFFICULTIES,
  DIFFICULTY_CONFIG,
  generatePuzzle,
  MAX_MISTAKES,
  type Difficulty,
} from "@/lib/sudoku/engine";
import { recordSoloResult } from "@/lib/sudoku/stats";
import { Board, type CellState } from "./Board";
import { MistakeMeter, NumberPad, useBoardKeys } from "./Controls";
import { BackLink, buttonStyles, clearPeerNotes, Toast, useIsClient, useToast } from "./ui";

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
}

const SAVE_KEY = "sudoku.solo.v1";

function newGame(difficulty: Difficulty, seed?: number): SoloState {
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
  };
}

function loadOrCreate(difficulty: Difficulty): SoloState {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null") as SoloState | null;
    if (saved && saved.difficulty === difficulty && saved.status === "playing") return saved;
  } catch {
    // Corrupt or unavailable storage: start fresh.
  }
  return newGame(difficulty);
}

export function SoloGame({ difficulty }: { difficulty: Difficulty }) {
  // The puzzle is random and may be resumed from localStorage, so render it
  // on the client only to avoid a hydration mismatch.
  const isClient = useIsClient();
  if (!isClient) return <div className="mx-auto aspect-square w-full max-w-[min(92vw,30rem)]" />;
  return <SoloGameInner key={difficulty} difficulty={difficulty} />;
}

function SoloGameInner({ difficulty }: { difficulty: Difficulty }) {
  const [game, setGame] = useState<SoloState>(() => loadOrCreate(difficulty));
  const [selected, setSelected] = useState<number | null>(null);
  const [notesMode, setNotesMode] = useState(false);
  const [flash, setFlash] = useState<{ index: number; key: number } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const { toast, show } = useToast();

  // Persist on every change so a refresh resumes the same game.
  useEffect(() => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(game));
    } catch {
      // Ignore storage failures.
    }
  }, [game]);

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
        if (won) {
          recordSoloResult(game.difficulty, true, game.elapsedMs);
          show("Solved! 🎉", "success");
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
      if (lost) recordSoloResult(game.difficulty, false, game.elapsedMs);
      show(
        lost
          ? `${n} is wrong — that's ${MAX_MISTAKES} mistakes. Game over.`
          : `${n} doesn't go there — mistake ${mistakes} of ${MAX_MISTAKES}`,
        "error",
      );
    },
    [game, notesMode, selected, show],
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
    setGame(newGame(difficulty, sameSeed ? game.seed : undefined));
    setSelected(null);
    setRevealed(false);
  };

  const filled = game.values.filter((v, i) => game.puzzle[i] === "0" && String(v) === game.solution[i]).length;
  const toFill = [...game.puzzle].filter((c) => c === "0").length;

  const overlay =
    game.status === "won" ? (
      <div className="space-y-4 px-6 text-center">
        <Trophy className="mx-auto size-10 text-amber-300" />
        <h2 className="font-display text-3xl">Solved</h2>
        <p className="text-sm text-stone-300">
          {DIFFICULTY_CONFIG[difficulty].label} in {formatDuration(game.elapsedMs)} with {game.mistakes}{" "}
          {game.mistakes === 1 ? "mistake" : "mistakes"}
        </p>
        <button type="button" onClick={() => restart(false)} className={buttonStyles.primary}>
          <Sparkles className="size-4" /> New puzzle
        </button>
      </div>
    ) : game.status === "lost" && !revealed ? (
      <div className="space-y-4 px-6 text-center">
        <h2 className="font-display text-3xl">Out of mistakes</h2>
        <p className="text-sm text-stone-300">
          You made {MAX_MISTAKES} mistakes. {filled}/{toFill} cells solved.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => restart(true)} className={buttonStyles.primary}>
            <RotateCcw className="size-4" /> Retry this puzzle
          </button>
          <button type="button" onClick={() => restart(false)} className={buttonStyles.secondary}>
            New puzzle
          </button>
          <button type="button" onClick={() => setRevealed(true)} className={buttonStyles.secondary}>
            Show solution
          </button>
        </div>
      </div>
    ) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <BackLink />
        <div className="flex gap-1 rounded-lg border border-white/10 p-0.5 text-xs">
          {DIFFICULTIES.map((d) => (
            <Link
              key={d}
              href={`/sudoku/play/${d}`}
              className={`rounded-md px-2.5 py-1 transition ${d === difficulty ? "bg-white/15 text-stone-50" : "text-stone-400 hover:text-stone-100"}`}
            >
              {DIFFICULTY_CONFIG[d].label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[min(92vw,30rem)] items-center justify-between text-sm">
        <MistakeMeter mistakes={game.mistakes} />
        <span className="text-stone-400 tabular-nums">
          {filled}/{toFill}
        </span>
        <span className="flex items-center gap-1.5 text-stone-300 tabular-nums">
          <Timer className="size-4" /> {formatDuration(game.elapsedMs)}
        </span>
      </div>

      <Board cells={cells} selected={selected} onSelect={setSelected} flash={flash} overlay={overlay} />

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
            <RotateCcw className="size-4" /> Retry this puzzle
          </button>
          <button type="button" onClick={() => restart(false)} className={buttonStyles.secondary}>
            New puzzle
          </button>
        </div>
      ) : null}

      <Toast toast={toast} />
    </div>
  );
}
