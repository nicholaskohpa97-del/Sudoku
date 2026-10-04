"use client";

// Tiny synthesised sound effects (Web Audio, no asset files) plus haptics.
import { useSyncExternalStore } from "react";

const MUTE_KEY = "sudoku.muted.v1";
const EVENT = "sudoku-muted";

let ctx: AudioContext | null = null;

function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Ignore storage failures.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useMuted(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVENT, cb);
      return () => window.removeEventListener(EVENT, cb);
    },
    isMuted,
    () => false,
  );
}

function audio(): AudioContext | null {
  if (typeof window === "undefined" || isMuted()) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One enveloped oscillator note. */
function note(freq: number, at: number, dur: number, type: OscillatorType = "sine", gain = 0.12) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function vibrate(pattern: number | number[]) {
  if (isMuted()) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported.
  }
}

// C major pentatonic, so any sequence sounds pleasant.
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98];

export const sfx = {
  tap: () => note(420, 0, 0.05, "triangle", 0.05),
  /** Pitch rises with the combo so streaks feel like they're building. */
  correct: (combo = 1) => {
    note(SCALE[Math.min(combo - 1, SCALE.length - 1)], 0, 0.16, "triangle", 0.1);
    vibrate(8);
  },
  wrong: () => {
    note(180, 0, 0.18, "sawtooth", 0.07);
    note(140, 0.08, 0.22, "sawtooth", 0.06);
    vibrate([30, 40, 30]);
  },
  /** Arpeggio per completed unit; more units, longer run. */
  unit: (units: number) => {
    const steps = 3 + units * 2;
    for (let k = 0; k < steps; k++) note(SCALE[k % SCALE.length] * (k >= SCALE.length ? 2 : 1), k * 0.05, 0.18, "sine", 0.09);
    vibrate(units > 1 ? [20, 30, 20, 30, 40] : 25);
  },
  digitDone: () => {
    note(1046.5, 0, 0.12, "triangle", 0.08);
    note(1567.98, 0.07, 0.2, "triangle", 0.08);
  },
  tick: () => note(660, 0, 0.08, "square", 0.05),
  go: () => {
    note(880, 0, 0.12, "square", 0.07);
    note(1318.51, 0.1, 0.3, "square", 0.07);
    vibrate(60);
  },
  win: () => {
    [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98].forEach((f, k) => note(f, k * 0.09, 0.35, "triangle", 0.1));
    vibrate([40, 50, 40, 50, 120]);
  },
  lose: () => {
    [392, 349.23, 293.66, 220].forEach((f, k) => note(f, k * 0.14, 0.3, "sine", 0.09));
  },
};
