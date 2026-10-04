"use client";

import { Eraser, Heart, HeartCrack, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MAX_MISTAKES } from "@/lib/sudoku/engine";
import { sfx } from "@/lib/sudoku/sfx";
import type { CellState } from "./Board";

interface NumberPadProps {
  cells: CellState[];
  notesMode: boolean;
  disabled?: boolean;
  onNumber: (n: number) => void;
  onErase: () => void;
  onToggleNotes: () => void;
}

export function NumberPad({ cells, notesMode, disabled, onNumber, onErase, onToggleNotes }: NumberPadProps) {
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

  return (
    <div className="mx-auto w-full max-w-[min(92vw,30rem)] space-y-3">
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
              className={`flex aspect-[3/4] flex-col items-center justify-center rounded-xl border font-num text-[clamp(1.25rem,5.2vw,1.8rem)] font-bold transition-all duration-100 active:translate-y-[3px] disabled:pointer-events-none ${
                remaining === 0
                  ? "border-lime-300/40 bg-lime-400/10 text-lime-300"
                  : notesMode
                    ? "border-pink-300/30 bg-pink-400/[0.08] text-pink-200 shadow-[0_3px_0_0_rgb(244_114_182/0.25)] hover:bg-pink-400/15 active:shadow-none"
                    : "border-cyan-300/30 bg-cyan-400/[0.08] text-cyan-200 shadow-[0_3px_0_0_rgb(34_211_238/0.25)] hover:bg-cyan-400/15 active:shadow-none"
              } ${disabled && remaining ? "opacity-40" : ""} ${bursting ? "animate-burst" : ""}`}
            >
              {n}
              <span className="font-sans text-[0.6rem] font-bold text-stone-400">{remaining || "✓"}</span>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={onToggleNotes}
          aria-pressed={notesMode}
          className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 font-display text-sm font-semibold transition disabled:opacity-40 ${
            notesMode
              ? "border-pink-300/70 bg-pink-400/20 text-pink-100 shadow-[0_0_18px_-4px_rgb(244_114_182/0.7)]"
              : "border-white/10 bg-white/[0.05] text-stone-300 hover:bg-white/10"
          }`}
        >
          <Pencil className="size-4" /> Notes {notesMode ? "on" : "off"}
          <kbd className="hidden rounded bg-white/10 px-1 font-sans text-[0.65rem] sm:inline">N</kbd>
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onErase}
          className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 font-display text-sm font-semibold text-stone-300 transition hover:bg-white/10 disabled:opacity-40"
        >
          <Eraser className="size-4" /> Erase
        </button>
      </div>
    </div>
  );
}

/** Three neon hearts; the one just lost cracks with a wobble. */
export function MistakeMeter({ mistakes }: { mistakes: number }) {
  const lives = MAX_MISTAKES - mistakes;
  return (
    <div className="flex items-center gap-1" aria-label={`${mistakes} of ${MAX_MISTAKES} mistakes`}>
      {Array.from({ length: MAX_MISTAKES }, (_, k) =>
        k < lives ? (
          <Heart key={`h${k}`} className="size-5 fill-rose-400 text-rose-400 drop-shadow-[0_0_6px_rgb(251_113_133/0.8)]" />
        ) : (
          <HeartCrack key={`c${k}`} className={`size-5 text-stone-600 ${k === lives ? "animate-heart-break" : ""}`} />
        ),
      )}
    </div>
  );
}

/** Keyboard: 1–9 enter, 0/Backspace/Delete erase, arrows move, N toggles notes. */
export function useBoardKeys(opts: {
  enabled: boolean;
  selected: number | null;
  setSelected: (i: number) => void;
  onNumber: (n: number) => void;
  onErase: () => void;
  onToggleNotes: () => void;
}) {
  const { enabled, selected, setSelected, onNumber, onErase, onToggleNotes } = opts;
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
        onToggleNotes();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, selected, setSelected, onNumber, onErase, onToggleNotes]);
}
