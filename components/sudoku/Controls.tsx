"use client";

import { Check, Eraser, FlaskConical, Heart, HeartCrack, Infinity as InfinityIcon, Lightbulb, Pencil, PenLine, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MAX_MISTAKES } from "@/lib/sudoku/engine";
import type { InputMode } from "@/lib/sudoku/game";
import { sfx } from "@/lib/sudoku/sfx";
import type { CellState } from "./Board";

const MODES: { id: InputMode; label: string; icon: typeof Pencil; key: string; on: string; digit: string }[] = [
  {
    id: "pen",
    label: "Pen",
    icon: PenLine,
    key: "P",
    on: "border-cyan-300/70 bg-cyan-400/20 text-cyan-100 shadow-[0_0_18px_-4px_rgb(34_211_238/0.7)]",
    digit:
      "border-cyan-300/30 bg-cyan-400/[0.08] text-cyan-200 shadow-[0_3px_0_0_rgb(34_211_238/0.25)] hover:bg-cyan-400/15",
  },
  {
    id: "notes",
    label: "Notes",
    icon: Pencil,
    key: "N",
    on: "border-pink-300/70 bg-pink-400/20 text-pink-100 shadow-[0_0_18px_-4px_rgb(244_114_182/0.7)]",
    digit:
      "border-pink-300/30 bg-pink-400/[0.08] text-pink-200 shadow-[0_3px_0_0_rgb(244_114_182/0.25)] hover:bg-pink-400/15",
  },
  {
    id: "trial",
    label: "Trial",
    icon: FlaskConical,
    key: "T",
    on: "border-amber-300/70 bg-amber-400/20 text-amber-100 shadow-[0_0_18px_-4px_rgb(252_211_77/0.7)]",
    digit:
      "border-amber-300/30 bg-amber-400/[0.08] text-amber-200 shadow-[0_3px_0_0_rgb(252_211_77/0.25)] hover:bg-amber-400/15",
  },
];

interface NumberPadProps {
  cells: CellState[];
  mode: InputMode;
  onMode: (m: InputMode) => void;
  disabled?: boolean;
  onNumber: (n: number) => void;
  onErase: () => void;
  /** Hints are offered in solo games only. */
  hint?: { left: number; onUse: () => void };
  /** Pencil-trial commit controls, shown while trying digits. */
  trial?: { count: number; onCommit: () => void; onClear: () => void };
  /** Hide the trial mode (not every screen offers it). */
  noTrial?: boolean;
}

export function NumberPad({ cells, mode, onMode, disabled, onNumber, onErase, hint, trial, noTrial }: NumberPadProps) {
  const placed = new Array(10).fill(0);
  for (const cell of cells) if (cell.value && !cell.wrong) placed[cell.value]++;

  // Burst + chime the moment a digit's ninth copy is placed.
  const prevDone = useRef<boolean[] | null>(null);
  const [burst, setBurst] = useState<{ n: number; key: number } | null>(null);
  const done = placed.map((p) => p >= 9);
  const doneSig = done.join();
  useEffect(() => {
    const prev = prevDone.current;
    const now = doneSig.split(",").map((d) => d === "true");
    prevDone.current = now;
    if (!prev) return;
    const n = now.findIndex((d, k) => d && !prev[k]);
    if (n > 0) {
      setBurst({ n, key: Date.now() });
      sfx.digitDone();
    }
  }, [doneSig]);

  const active = MODES.find((m) => m.id === mode)!;
  const modes = noTrial ? MODES.filter((m) => m.id !== "trial") : MODES;

  return (
    <div className="mx-auto w-full max-w-[min(92vw,30rem)] space-y-3">
      {trial && !disabled && (mode === "trial" || trial.count > 0) ? (
        <div className="animate-rise flex items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/[0.06] p-2">
          <p className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold text-amber-100/90">
            <FlaskConical className="size-4 shrink-0" />
            <span>
              {trial.count ? `${trial.count} tentative` : "Try digits freely"}
              <span className="text-amber-100/60"> · unchecked until you commit; a wrong one costs a life</span>
            </span>
          </p>
          <button
            type="button"
            disabled={trial.count === 0}
            onClick={trial.onCommit}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-300 px-3 py-2 font-display text-sm font-bold text-night transition hover:bg-amber-200 disabled:opacity-40"
          >
            <Check className="size-4" /> Commit{trial.count ? ` ${trial.count}` : ""}
            <kbd className="hidden rounded bg-night/15 px-1 font-sans text-[0.6rem] sm:inline">Enter</kbd>
          </button>
          <button
            type="button"
            disabled={trial.count === 0}
            onClick={trial.onClear}
            aria-label="Clear all trial digits"
            className="flex shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] p-2.5 text-stone-300 transition hover:bg-white/10 disabled:opacity-40"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ) : null}
      <div className="grid grid-cols-9 gap-1.5">
        {Array.from({ length: 9 }, (_, k) => {
          const n = k + 1;
          const remaining = 9 - placed[n];
          const bursting = burst?.n === n;
          return (
            <button
              key={bursting ? `${n}-${burst.key}` : n}
              type="button"
              disabled={disabled || remaining === 0}
              onClick={() => onNumber(n)}
              aria-label={`Enter ${n}${remaining ? `, ${remaining} left` : ", complete"}`}
              className={`flex aspect-[3/4] flex-col items-center justify-center rounded-xl border font-num text-[clamp(1.25rem,5.2vw,1.8rem)] font-bold transition-all duration-100 active:translate-y-[3px] active:shadow-none disabled:pointer-events-none ${
                remaining === 0 ? "border-lime-300/40 bg-lime-400/10 text-lime-300" : active.digit
              } ${disabled && remaining ? "opacity-40" : ""} ${bursting ? "animate-burst" : ""}`}
            >
              {n}
              <span className="font-sans text-[0.6rem] font-bold text-stone-400">{remaining || "✓"}</span>
            </button>
          );
        })}
      </div>

      <div role="group" aria-label="Input mode" className={`grid gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-1 ${modes.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {modes.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              type="button"
              disabled={disabled}
              onClick={() => onMode(m.id)}
              aria-pressed={mode === m.id}
              title={m.id === "trial" ? "Pencil trial: one tentative digit per cell, not checked until you commit" : undefined}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 font-display text-sm font-semibold transition disabled:opacity-40 ${
                mode === m.id ? m.on : "border-transparent text-stone-400 hover:bg-white/[0.06] hover:text-stone-200"
              }`}
            >
              <Icon className="size-4" /> {m.label}
              <kbd className="hidden rounded bg-white/10 px-1 font-sans text-[0.6rem] sm:inline">{m.key}</kbd>
            </button>
          );
        })}
      </div>

      <div className={`grid gap-2 ${hint ? "grid-cols-2" : "grid-cols-1"}`}>
        <button
          type="button"
          disabled={disabled}
          onClick={onErase}
          className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 font-display text-sm font-semibold text-stone-300 transition hover:bg-white/10 disabled:opacity-40"
        >
          <Eraser className="size-4" /> Erase
        </button>
        {hint ? (
          <button
            type="button"
            disabled={disabled || hint.left === 0}
            onClick={hint.onUse}
            className="flex items-center justify-center gap-2 rounded-xl border border-yellow-300/30 bg-yellow-300/[0.07] px-3 py-2.5 font-display text-sm font-semibold text-yellow-200 transition hover:bg-yellow-300/15 disabled:opacity-40"
          >
            <Lightbulb className="size-4" /> Hint
            <span className="font-num text-xs text-yellow-100/80">{hint.left} left</span>
            <kbd className="hidden rounded bg-white/10 px-1 font-sans text-[0.6rem] sm:inline">H</kbd>
          </button>
        ) : null}
      </div>

    </div>
  );
}

/** Neon hearts for the lives chosen; each one lost cracks with a wobble. 0 lives means unlimited. */
export function LivesMeter({ lives, lost }: { lives: number; lost: number }) {
  if (lives === 0) {
    return (
      <div className="flex items-center gap-1.5 font-display text-sm font-semibold text-stone-300" aria-label={`Practice mode, ${lost} mistakes`}>
        <InfinityIcon className="size-5 text-cyan-300" />
        <span className="font-num text-xs text-rose-300">{lost ? `${lost} ✗` : "practice"}</span>
      </div>
    );
  }
  const left = Math.max(0, lives - lost);
  const size = lives > 5 ? "size-4" : "size-5";
  return (
    <div className="flex flex-wrap items-center gap-0.5" aria-label={`${left} of ${lives} lives left`}>
      {Array.from({ length: lives }, (_, k) =>
        k < left ? (
          <Heart key={`h${k}`} className={`${size} fill-rose-400 text-rose-400 drop-shadow-[0_0_6px_rgb(251_113_133/0.8)]`} />
        ) : (
          <HeartCrack key={`c${k}`} className={`${size} text-stone-600 ${k === left ? "animate-heart-break" : ""}`} />
        ),
      )}
    </div>
  );
}

/** The fixed three-life meter used by multiplayer rooms. */
export function MistakeMeter({ mistakes, lives = MAX_MISTAKES }: { mistakes: number; lives?: number }) {
  return <LivesMeter lives={lives} lost={mistakes} />;
}

/** Keyboard: 1–9 enter, 0/Backspace/Delete erase, arrows move, P/N/T switch mode, H hint, Enter commits trials. */
export function useBoardKeys(opts: {
  enabled: boolean;
  selected: number | null;
  setSelected: (i: number) => void;
  onNumber: (n: number) => void;
  onErase: () => void;
  mode: InputMode;
  onMode: (m: InputMode) => void;
  onHint?: () => void;
  onCommit?: () => void;
  noTrial?: boolean;
}) {
  const { enabled, selected, setSelected, onNumber, onErase, mode, onMode, onHint, onCommit, noTrial } = opts;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const move = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key];
      if (move !== undefined) {
        e.preventDefault();
        const from = selected ?? 40;
        let next = from + move;
        if (e.key === "ArrowLeft" && from % 9 === 0) next = from + 8;
        if (e.key === "ArrowRight" && from % 9 === 8) next = from - 8;
        setSelected((next + 81) % 81);
      } else if (/^[1-9]$/.test(e.key)) {
        onNumber(Number(e.key));
      } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
        onErase();
      } else if (e.key === "n" || e.key === "N") {
        onMode(mode === "notes" ? "pen" : "notes");
      } else if (e.key === "p" || e.key === "P") {
        onMode("pen");
      } else if ((e.key === "t" || e.key === "T") && !noTrial) {
        onMode(mode === "trial" ? "pen" : "trial");
      } else if ((e.key === "h" || e.key === "H") && onHint) {
        onHint();
      } else if (e.key === "Enter" && onCommit) {
        onCommit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, selected, setSelected, onNumber, onErase, mode, onMode, onHint, onCommit, noTrial]);
}
