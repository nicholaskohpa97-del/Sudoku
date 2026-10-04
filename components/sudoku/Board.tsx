"use client";

import { boxOf, colOf, rowOf } from "@/lib/sudoku/engine";

export interface CellState {
  value: number;
  given: boolean;
  wrong: boolean;
  /** Pencil-mark bitmask, bit d set for digit d. */
  notes: number;
}

interface BoardProps {
  cells: CellState[];
  selected: number | null;
  onSelect: (index: number) => void;
  /** Index of the most recent mistake, to replay the shake animation. */
  flash?: { index: number; key: number } | null;
  disabled?: boolean;
  overlay?: React.ReactNode;
}

export function Board({ cells, selected, onSelect, flash, disabled, overlay }: BoardProps) {
  const selectedValue = selected !== null ? cells[selected]?.value : 0;

  return (
    <div className="relative mx-auto w-full max-w-[min(92vw,30rem)]">
      <div
        role="grid"
        aria-label="Sudoku board"
        className="grid aspect-square grid-cols-9 overflow-hidden rounded-xl border-2 border-stone-300/70 bg-[#111a28] shadow-2xl shadow-black/40"
      >
        {cells.map((cell, i) => {
          const r = rowOf(i);
          const c = colOf(i);
          const isSelected = i === selected;
          const related =
            selected !== null &&
            !isSelected &&
            (rowOf(selected) === r || colOf(selected) === c || boxOf(selected) === boxOf(i));
          const sameValue = !isSelected && selectedValue > 0 && cell.value === selectedValue && !cell.wrong;

          let bg = "";
          if (isSelected && cell.wrong) bg = "bg-rose-500/25 ring-2 ring-inset ring-amber-300/70";
          else if (isSelected) bg = "bg-amber-300/30";
          else if (cell.wrong) bg = "bg-rose-500/20";
          else if (sameValue) bg = "bg-amber-300/15";
          else if (related) bg = "bg-white/[0.06]";

          let text = "text-sky-300";
          if (cell.given) text = "text-stone-100";
          else if (cell.wrong) text = "text-rose-400";

          const borders = [
            c === 2 || c === 5 ? "border-r-2 border-r-stone-300/60" : c < 8 ? "border-r border-r-white/10" : "",
            r === 2 || r === 5 ? "border-b-2 border-b-stone-300/60" : r < 8 ? "border-b border-b-white/10" : "",
          ].join(" ");

          const shaking = flash?.index === i;

          return (
            <button
              key={shaking ? `${i}-${flash.key}` : i}
              type="button"
              role="gridcell"
              aria-label={`Row ${r + 1}, column ${c + 1}${cell.value ? `, ${cell.value}` : ", empty"}${cell.wrong ? ", incorrect" : ""}`}
              aria-selected={isSelected}
              disabled={disabled}
              onClick={() => onSelect(i)}
              className={`relative flex items-center justify-center font-sans text-[clamp(1.05rem,5.2vw,1.9rem)] leading-none transition-colors outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-inset ${borders} ${bg} ${text} ${cell.given ? "font-semibold" : "font-medium"} ${shaking ? "animate-shake" : ""}`}
            >
              {cell.value > 0 ? (
                cell.value
              ) : cell.notes ? (
                <span className="grid h-full w-full grid-cols-3 grid-rows-3 p-[6%] text-[clamp(0.45rem,1.9vw,0.7rem)] leading-none text-stone-400">
                  {Array.from({ length: 9 }, (_, k) => (
                    <span key={k} className="flex items-center justify-center">
                      {cell.notes & (1 << (k + 1)) ? k + 1 : ""}
                    </span>
                  ))}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {overlay ? (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-[#0d1420]/80 backdrop-blur-sm">
          {overlay}
        </div>
      ) : null}
    </div>
  );
}
