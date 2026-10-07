"use client";

import { boxOf, colOf, rowOf } from "@/lib/sudoku/engine";
import { usePrefs } from "@/lib/sudoku/prefs";

/** Extra highlighting for hints and the walkthrough. */
export interface CellMark {
  /** Part of the pattern being pointed out. */
  pattern?: boolean;
  /** In a unit being pointed out. */
  unit?: boolean;
  /** Receives a digit in this step. */
  placed?: boolean;
  /** Pencil marks to emphasise (bitmask). */
  focus?: number;
  /** Pencil marks this step removes (bitmask), shown struck through. */
  removed?: number;
}

export interface CellState {
  value: number;
  given: boolean;
  wrong: boolean;
  /** Pencil-mark bitmask, bit d set for digit d. */
  notes: number;
  /** A tentative pencil-trial digit: never checked until committed. */
  trial?: number;
  mark?: CellMark;
}

/** One-shot animations; each `key` change replays its effect. */
export interface BoardEffects {
  /** The cell that just received a correct number. */
  pop: { index: number; key: number } | null;
  /** Cells lighting up after a row/column/box is completed, with per-cell delay in ms. */
  sweep: { delays: Record<number, number>; key: number } | null;
  /** Text that floats up from a cell ("ROW CLEAR!", "DOUBLE!", "COMBO ×2"). */
  label: { index: number; text: string; tone: "cyan" | "pink" | "lime" | "gold"; key: number } | null;
}

interface BoardProps {
  cells: CellState[];
  selected: number | null;
  onSelect: (index: number) => void;
  /** Index of the most recent mistake, to replay the shake animation. */
  flash?: { index: number; key: number } | null;
  effects?: BoardEffects;
  disabled?: boolean;
  overlay?: React.ReactNode;
}

const LABEL_TONE = {
  cyan: "text-cyan-200 text-glow-cyan",
  pink: "text-pink-200 text-glow-pink",
  lime: "text-lime-200 [text-shadow:0_0_18px_rgb(163_230_53/0.7)]",
  gold: "text-yellow-200 text-glow-gold",
};

export function Board({ cells, selected, onSelect, flash, effects, disabled, overlay }: BoardProps) {
  const prefs = usePrefs();
  const selectedValue = selected !== null ? cells[selected]?.value : 0;
  const sweep = effects?.sweep ?? null;
  const pop = effects?.pop ?? null;
  const label = effects?.label ?? null;

  return (
    <div className="relative mx-auto w-full max-w-[min(92vw,30rem)]">
      <div
        aria-hidden
        className="absolute -inset-3 -z-10 rounded-[1.6rem] bg-gradient-to-br from-cyan-400/25 via-violet-500/10 to-pink-400/25 blur-xl"
      />
      <div
        role="grid"
        aria-label="Sudoku board"
        className="grid aspect-square grid-cols-9 overflow-hidden rounded-2xl border-2 border-cyan-300/50 bg-night-2 shadow-[0_0_0_4px_rgb(11_8_32),0_0_40px_-6px_rgb(34_211_238/0.45)]"
      >
        {cells.map((cell, i) => {
          const r = rowOf(i);
          const c = colOf(i);
          const isSelected = i === selected;
          const related =
            prefs.highlightRelated &&
            selected !== null &&
            !isSelected &&
            (rowOf(selected) === r || colOf(selected) === c || boxOf(selected) === boxOf(i));
          const sameValue = prefs.highlightSame && !isSelected && selectedValue > 0 && cell.value === selectedValue && !cell.wrong;

          let bg = (Math.floor(r / 3) + Math.floor(c / 3)) % 2 === 0 ? "bg-white/[0.015]" : "bg-violet-400/[0.045]";
          if (isSelected && cell.wrong) bg = "bg-rose-500/30 ring-2 ring-inset ring-cyan-300";
          else if (isSelected) bg = "bg-cyan-400/30 ring-2 ring-inset ring-cyan-200/80";
          else if (cell.wrong) bg = "bg-rose-500/20";
          else if (sameValue) bg = "bg-pink-400/20";
          else if (related) bg = "bg-cyan-300/[0.08]";

          let text = "text-cyan-300";
          if (cell.given) text = "text-stone-50";
          else if (cell.wrong) text = "text-rose-400";
          if (sameValue && !cell.given) text = "text-pink-200";

          const mark = cell.mark;
          if (mark?.placed && !isSelected) bg = "bg-lime-400/25";
          else if (mark?.pattern && !isSelected) bg = "bg-amber-300/25";
          else if (mark?.unit && !isSelected && !cell.wrong) bg = "bg-amber-200/[0.09]";
          const markRing = mark?.pattern ? "ring-2 ring-inset ring-amber-300/80" : mark?.placed ? "ring-2 ring-inset ring-lime-300/80" : "";

          const borders = [
            c === 2 || c === 5 ? "border-r-2 border-r-cyan-300/40" : c < 8 ? "border-r border-r-white/[0.07]" : "",
            r === 2 || r === 5 ? "border-b-2 border-b-cyan-300/40" : r < 8 ? "border-b border-b-white/[0.07]" : "",
          ].join(" ");

          const shaking = flash?.index === i;
          const sweepDelay = sweep?.delays[i];
          const popping = pop?.index === i;
          const valueKey = popping ? `p${pop.key}` : sweepDelay !== undefined ? `s${sweep!.key}` : "v";

          return (
            <button
              key={shaking ? `${i}-${flash.key}` : i}
              type="button"
              role="gridcell"
              aria-label={`Row ${r + 1}, column ${c + 1}${cell.value ? `, ${cell.value}` : cell.trial ? `, trying ${cell.trial}` : ", empty"}${cell.wrong ? ", incorrect" : ""}`}
              aria-selected={isSelected}
              disabled={disabled}
              onClick={() => onSelect(i)}
              className={`relative flex items-center justify-center font-num text-[clamp(1.1rem,5.4vw,2rem)] leading-none transition-colors outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-inset ${borders} ${bg} ${markRing} ${text} ${cell.given ? "font-bold" : "font-semibold"} ${shaking ? "animate-shake" : ""}`}
            >
              {sweepDelay !== undefined ? (
                <span
                  key={`sweep-${sweep!.key}`}
                  aria-hidden
                  className="sweep-delay animate-unit-sweep pointer-events-none absolute inset-[3px] rounded-lg bg-[radial-gradient(circle,rgb(255_255_255/0.95)_0%,rgb(34_211_238/0.75)_40%,rgb(244_114_182/0.25)_75%,transparent_100%)]"
                  style={{ "--d": `${sweepDelay}ms` } as React.CSSProperties}
                />
              ) : null}
              {cell.value > 0 ? (
                <span
                  key={valueKey}
                  className={`relative ${valueKey !== "v" ? "sweep-delay animate-cell-pop" : ""}`}
                  style={sweepDelay !== undefined && !popping ? ({ "--d": `${sweepDelay}ms` } as React.CSSProperties) : undefined}
                >
                  {cell.value}
                </span>
              ) : cell.trial ? (
                <span
                  className="relative flex h-full w-full items-center justify-center text-amber-300 italic outline-dashed outline-1 -outline-offset-[5px] outline-amber-300/50"
                  title="Tentative: not checked until you commit"
                >
                  {cell.trial}
                </span>
              ) : cell.notes ? (
                <span className="grid h-full w-full grid-cols-3 grid-rows-3 p-[6%] font-sans text-[clamp(0.45rem,1.9vw,0.7rem)] leading-none font-bold text-stone-400">
                  {Array.from({ length: 9 }, (_, k) => {
                    const d = k + 1;
                    const on = cell.notes & (1 << d);
                    const removed = mark?.removed && mark.removed & (1 << d);
                    const focus = mark?.focus && mark.focus & (1 << d);
                    return (
                      <span
                        key={k}
                        className={`flex items-center justify-center ${removed ? "text-rose-400 line-through" : focus ? "font-extrabold text-amber-200" : ""}`}
                      >
                        {on ? d : ""}
                      </span>
                    );
                  })}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {label ? (
        <span
          key={label.key}
          aria-hidden
          className={`animate-float-up pointer-events-none absolute z-20 font-display text-[clamp(1.2rem,6vw,2rem)] font-bold whitespace-nowrap ${LABEL_TONE[label.tone]}`}
          // Clamp so labels from edge cells stay inside the board.
          style={{
            left: `${Math.min(80, Math.max(20, ((colOf(label.index) + 0.5) / 9) * 100))}%`,
            top: `${(Math.max(1, rowOf(label.index)) / 9) * 100}%`,
          }}
        >
          {label.text}
        </span>
      ) : null}
      {overlay ? (
        <div className="animate-rise absolute inset-0 z-30 flex flex-col items-center overflow-y-auto rounded-2xl bg-night/85 py-3 backdrop-blur-sm">
          {/* my-auto centres the card but still lets a tall one scroll from its top. */}
          <div className="my-auto flex w-full justify-center">{overlay}</div>
        </div>
      ) : null}
    </div>
  );
}
