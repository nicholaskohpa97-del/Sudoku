"use client";

// Game feel shared by solo and multiplayer: combo tracking, the row/column/
// box completion sweep, floating labels, sounds, haptics and confetti.
import confetti from "canvas-confetti";
import { Flame } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { colOf, completedUnits, rowOf, type CompletedUnit } from "@/lib/sudoku/engine";
import { recordMoment } from "@/lib/sudoku/profile";
import { ACHIEVEMENTS, COMBO_WINDOW_MS, comboMultiplier } from "@/lib/sudoku/progress";
import { sfx } from "@/lib/sudoku/sfx";
import type { BoardEffects } from "./Board";

const STAGGER_MS = 55;

const UNIT_LABEL: Record<CompletedUnit["kind"], string> = { row: "ROW CLEAR!", col: "COLUMN CLEAR!", box: "BOX CLEAR!" };
const MULTI_LABEL = ["", "", "DOUBLE!", "TRIPLE!"];

/** Delay per cell: a ripple spreading out from the cell that completed the unit(s). */
export function sweepDelays(units: { cells: number[] }[], origin: number, stagger = STAGGER_MS): Record<number, number> {
  const delays: Record<number, number> = {};
  for (const unit of units) {
    for (const i of unit.cells) {
      const d = Math.max(Math.abs(rowOf(i) - rowOf(origin)), Math.abs(colOf(i) - colOf(origin))) * stagger;
      delays[i] = Math.min(delays[i] ?? Infinity, d);
    }
  }
  return delays;
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

let shooter: confetti.CreateTypes | null = null;

/**
 * Our own confetti canvas without a Web Worker: the default instance spawns
 * a blob: worker, which the strict CSP (script-src 'self') rightly blocks.
 */
function getShooter(): confetti.CreateTypes {
  if (!shooter) {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:60";
    document.body.appendChild(canvas);
    shooter = confetti.create(canvas, { resize: true, useWorker: false });
  }
  return shooter;
}

export function fireConfetti(big = true) {
  if (reducedMotion()) return;
  const confetti = getShooter();
  const colors = ["#22d3ee", "#f472b6", "#a3e635", "#facc15", "#ffffff"];
  confetti({ particleCount: big ? 140 : 60, spread: 80, origin: { y: 0.6 }, colors, disableForReducedMotion: true });
  if (big) {
    setTimeout(() => confetti({ particleCount: 70, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors }), 220);
    setTimeout(() => confetti({ particleCount: 70, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors }), 380);
  }
}

export interface Combo {
  count: number;
  /** When the combo was last extended; the meter drains from here. */
  at: number;
}

export function useJuice(onAchievement?: (text: string) => void) {
  const [effects, setEffects] = useState<BoardEffects>({ pop: null, sweep: null, label: null });
  const [combo, setCombo] = useState<Combo>({ count: 0, at: 0 });
  const comboRef = useRef<Combo>({ count: 0, at: 0 });
  const maxCombo = useRef(0);

  const announce = useCallback(
    (ids: string[]) => {
      for (const id of ids) {
        const a = ACHIEVEMENTS.find((x) => x.id === id);
        if (a) onAchievement?.(`${a.emoji} Achievement unlocked: ${a.name}`);
      }
    },
    [onAchievement],
  );

  /**
   * Call after a correct entry. `board` holds only correct digits (givens
   * plus correct entries), "0" elsewhere, including the new one at `index`.
   */
  const correct = useCallback(
    (board: string, index: number) => {
      const now = Date.now();
      const prev = comboRef.current;
      const count = prev.count && now - prev.at <= COMBO_WINDOW_MS ? prev.count + 1 : 1;
      comboRef.current = { count, at: now };
      setCombo(comboRef.current);
      maxCombo.current = Math.max(maxCombo.current, count);

      const units = completedUnits(board, index);
      const multiplierUp = comboMultiplier(count) > comboMultiplier(count - 1);
      let label: BoardEffects["label"] = null;
      if (units.length >= 2) label = { index, text: MULTI_LABEL[units.length], tone: "pink", key: now };
      else if (units.length === 1) label = { index, text: UNIT_LABEL[units[0].kind], tone: "cyan", key: now };
      else if (multiplierUp) label = { index, text: `COMBO ×${comboMultiplier(count)}`, tone: "gold", key: now };

      setEffects({
        pop: { index, key: now },
        sweep: units.length ? { delays: sweepDelays(units, index), key: now } : null,
        label,
      });
      if (units.length) sfx.unit(units.length);
      else sfx.correct(count);

      if (units.length >= 2 || count >= 10) announce(recordMoment({ combo: count, unitsAtOnce: units.length }));
      return { units, combo: count };
    },
    [announce],
  );

  const wrong = useCallback(() => {
    comboRef.current = { count: 0, at: 0 };
    setCombo(comboRef.current);
    sfx.wrong();
  }, []);

  /** Whole-board ripple from the final cell, then confetti. */
  const celebrate = useCallback((index: number, text = "SOLVED!") => {
    const now = Date.now();
    const all = [{ cells: Array.from({ length: 81 }, (_, i) => i) }];
    setEffects({ pop: { index, key: now }, sweep: { delays: sweepDelays(all, index, 70), key: now }, label: { index, text, tone: "lime", key: now } });
    sfx.win();
    setTimeout(() => fireConfetti(true), 450);
  }, []);

  const reset = useCallback(() => {
    comboRef.current = { count: 0, at: 0 };
    maxCombo.current = 0;
    setCombo(comboRef.current);
    setEffects({ pop: null, sweep: null, label: null });
  }, []);

  return { effects, combo, maxCombo, correct, wrong, celebrate, reset, announce };
}

/** "🔥 ×5 COMBO" pill with a bar that drains over the combo window. */
export function ComboMeter({ combo }: { combo: Combo }) {
  if (combo.count < 2) return <span className="h-7" />;
  const mult = comboMultiplier(combo.count);
  return (
    <span
      key={combo.count}
      className="animate-cell-pop relative inline-flex h-7 items-center gap-1 overflow-hidden rounded-full border border-yellow-300/50 bg-yellow-300/10 px-2.5 font-display text-sm font-bold text-yellow-200"
    >
      <Flame className="size-4 fill-orange-400 text-orange-300" />×{combo.count}
      {mult > 1 ? <span className="rounded-full bg-pink-400 px-1.5 text-xs text-night">{mult}x</span> : null}
      <span
        key={combo.at}
        aria-hidden
        className="animate-drain absolute inset-x-0 bottom-0 h-0.5 origin-left bg-yellow-300"
        style={{ animationDuration: `${COMBO_WINDOW_MS}ms` }}
      />
    </span>
  );
}
