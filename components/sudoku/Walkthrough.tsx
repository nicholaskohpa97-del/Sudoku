"use client";

import { ChevronLeft, ChevronRight, Pause, Play, SkipForward, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { explainStep } from "@/lib/sudoku/explain";
import { applyStep, cloneState, isSolved, nextStep, stateFromGrid, TECHNIQUES, UNITS, type State, type Step } from "@/lib/sudoku/solver";
import { Board, type CellState } from "./Board";
import { buttonStyles } from "./ui";

interface Trace {
  steps: Step[];
  /** State before each step, plus the final state. */
  states: State[];
}

function buildTrace(board: string): Trace {
  const s = stateFromGrid(board);
  const steps: Step[] = [];
  const states: State[] = [];
  while (!isSolved(s) && steps.length < 300) {
    const step = nextStep(s);
    if (!step) break;
    states.push(cloneState(s));
    steps.push(step);
    applyStep(s, step);
  }
  states.push(cloneState(s));
  return { steps, states };
}

/**
 * Step-by-step solution, from the player's current position: which technique,
 * where, and why. Each step shows the pencil marks it reasons about.
 */
export function Walkthrough({
  puzzle,
  board,
  onNext,
  nextLabel = "Next puzzle",
}: {
  puzzle: string;
  /** Givens plus the player's correct entries. */
  board: string;
  onNext: () => void;
  nextLabel?: string;
}) {
  const [trace, setTrace] = useState<Trace | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    // Forcing steps can take a moment on the hardest puzzles; keep the UI responsive.
    const id = setTimeout(() => setTrace(buildTrace(board)), 30);
    return () => clearTimeout(id);
  }, [board]);

  const total = trace?.steps.length ?? 0;
  useEffect(() => {
    if (!playing || !trace) return;
    const id = setInterval(() => {
      setIndex((i) => {
        if (i >= total) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 2600);
    return () => clearInterval(id);
  }, [playing, trace, total]);

  const view = useMemo(() => {
    if (!trace) return null;
    const state = trace.states[Math.min(index, total)];
    const step = index < total ? trace.steps[index] : null;
    const ex = step ? explainStep(step, state) : null;
    const unitCells = new Set<number>();
    for (const u of ex?.highlights.units ?? []) for (const c of UNITS[u]) unitCells.add(c);
    const pattern = new Set(ex?.highlights.pattern ?? []);
    const placed = new Map((step?.placements ?? []).map((p) => [p.cell, p.digit]));
    const removed = new Map<number, number>();
    for (const e of ex?.highlights.removed ?? []) removed.set(e.cell, (removed.get(e.cell) ?? 0) | (1 << e.digit));
    const focus = (ex?.highlights.digits ?? []).reduce((m, d) => m | (1 << d), 0);
    const cells: CellState[] = Array.from({ length: 81 }, (_, i) => {
      const preview = placed.get(i);
      return {
        value: preview ?? state.cells[i],
        given: puzzle[i] !== "0",
        wrong: false,
        notes: state.cells[i] || preview ? 0 : state.cand[i],
        mark: {
          pattern: pattern.has(i),
          unit: unitCells.has(i),
          placed: preview !== undefined,
          focus,
          removed: removed.get(i),
        },
      };
    });
    return { cells, step, ex };
  }, [trace, index, total, puzzle]);

  if (!trace || !view) {
    return (
      <div className="mx-auto w-full max-w-[min(92vw,30rem)] rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center text-sm font-semibold text-stone-300">
        Working out the solution…
      </div>
    );
  }

  const done = index >= total;
  return (
    <div className="space-y-3">
      <Board cells={view.cells} selected={null} onSelect={() => {}} disabled />

      <div className="mx-auto w-full max-w-[min(92vw,30rem)] space-y-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3" aria-live="polite">
        {view.ex && view.step ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-display text-base font-bold text-amber-200">{view.ex.title}</p>
              <span className="font-num text-xs font-semibold text-stone-400 tabular-nums">
                Step {index + 1} of {total}
              </span>
            </div>
            <p className="text-sm font-semibold text-stone-100">{view.ex.text}</p>
            <p className="text-[0.7rem] font-semibold text-stone-500">
              {TECHNIQUES[view.step.technique].blurb} Difficulty weight {view.step.weight.toFixed(1)}.
            </p>
          </>
        ) : (
          <p className="flex items-center gap-2 font-display text-base font-bold text-lime-200">
            <Sparkles className="size-4" /> The grid is complete.
          </p>
        )}
      </div>

      <div className="mx-auto flex w-full max-w-[min(92vw,30rem)] items-center gap-2">
        <button type="button" onClick={() => { setPlaying(false); setIndex(0); }} className={`${buttonStyles.secondary} !px-3 !py-2`} aria-label="Back to the start" disabled={index === 0}>
          <ChevronLeft className="size-4" />
          <ChevronLeft className="-ml-3 size-4" />
        </button>
        <button type="button" onClick={() => { setPlaying(false); setIndex((i) => Math.max(0, i - 1)); }} className={`${buttonStyles.secondary} !px-3 !py-2`} aria-label="Previous step" disabled={index === 0}>
          <ChevronLeft className="size-4" />
        </button>
        <input
          type="range"
          min={0}
          max={total}
          value={index}
          onChange={(e) => { setPlaying(false); setIndex(Number(e.target.value)); }}
          aria-label="Step"
          className="min-w-0 flex-1 accent-cyan-300"
        />
        <button
          type="button"
          onClick={() => { if (done) setIndex(0); setPlaying((p) => !p); }}
          className={`${buttonStyles.secondary} !px-3 !py-2`}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        <button type="button" onClick={() => { setPlaying(false); setIndex((i) => Math.min(total, i + 1)); }} className={`${buttonStyles.secondary} !px-3 !py-2`} aria-label="Next step" disabled={done}>
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-[min(92vw,30rem)] flex-wrap items-center justify-between gap-3">
        <p className="min-w-[10rem] flex-1 text-xs font-semibold text-stone-400">This puzzle is locked and scores nothing.</p>
        <button type="button" onClick={onNext} className={`${buttonStyles.primary} whitespace-nowrap`}>
          <SkipForward className="size-4" /> {nextLabel}
        </button>
      </div>
    </div>
  );
}
