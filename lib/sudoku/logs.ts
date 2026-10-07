"use client";

// Move logs of recently won games, kept so a score can still be posted from the
// history screen. Logs are big, so only the latest few are kept.
import type { MoveEvent } from "./game";

const KEY = "sudoku.logs.v1";
const KEEP = 8;

type Logs = Record<string, { at: number; log: MoveEvent[] }>;

function read(): Logs {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Logs;
  } catch {
    return {};
  }
}

export function keepLog(id: string, log: MoveEvent[]): void {
  const logs = { ...read(), [id]: { at: Date.now(), log } };
  const newest = Object.entries(logs).sort((a, b) => b[1].at - a[1].at).slice(0, KEEP);
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(newest)));
  } catch {
    // Storage full or blocked: posting from history just won't be offered.
  }
}

export function loadLog(id: string): MoveEvent[] | null {
  return read()[id]?.log ?? null;
}
