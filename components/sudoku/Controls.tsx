"use client";

import { Eraser, Heart, HeartCrack, Pencil } from "lucide-react";
import { useEffect } from "react";
import { MAX_MISTAKES } from "@/lib/sudoku/engine";
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

  return (
    <div className="mx-auto w-full max-w-[min(92vw,30rem)] space-y-3">
      <div className="grid grid-cols-9 gap-1.5">
        {Array.from({ length: 9 }, (_, k) => {
          const n = k + 1;
          const remaining = 9 - placed[n];
          return (
            <button
              key={n}
              type="button"
              disabled={disabled || remaining === 0}
              onClick={() => onNumber(n)}
              aria-label={`Enter ${n}${remaining ? `, ${remaining} left` : ", complete"}`}
              className="flex aspect-[3/4] flex-col items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[clamp(1.2rem,5vw,1.7rem)] font-medium text-sky-200 transition hover:bg-white/10 active:scale-95 disabled:opacity-25"
            >
              {n}
              <span className="text-[0.6rem] font-normal text-stone-500">{remaining || "✓"}</span>
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
          className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition disabled:opacity-40 ${
            notesMode
              ? "border-amber-300/60 bg-amber-300/15 text-amber-200"
              : "border-white/10 bg-white/[0.04] text-stone-300 hover:bg-white/10"
          }`}
        >
          <Pencil className="size-4" /> Notes {notesMode ? "on" : "off"}
          <kbd className="hidden rounded bg-white/10 px-1 text-[0.65rem] sm:inline">N</kbd>
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onErase}
          className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-stone-300 transition hover:bg-white/10 disabled:opacity-40"
        >
          <Eraser className="size-4" /> Erase
        </button>
      </div>
    </div>
  );
}

export function MistakeMeter({ mistakes }: { mistakes: number }) {
  return (
    <div className="flex items-center gap-1" aria-label={`${mistakes} of ${MAX_MISTAKES} mistakes`}>
      {Array.from({ length: MAX_MISTAKES }, (_, k) =>
        k < MAX_MISTAKES - mistakes ? (
          <Heart key={k} className="size-4 fill-rose-400 text-rose-400" />
        ) : (
          <HeartCrack key={k} className="size-4 text-stone-600" />
        ),
      )}
      <span className="ml-1 text-xs text-stone-400 tabular-nums">
        {mistakes}/{MAX_MISTAKES}
      </span>
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
