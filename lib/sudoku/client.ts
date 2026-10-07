"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { PlayerSession } from "./types";

const SESSION_KEY = "sudoku.session.v1";

function loadSession(): PlayerSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as PlayerSession) : null;
  } catch {
    return null;
  }
}

function saveSession(session: PlayerSession | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage blocked (private mode): the session lasts for this tab only.
  }
  window.dispatchEvent(new Event("sudoku-session"));
}

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
    /** The rest of the error body (e.g. name suggestions). */
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { body?: string } = {}): Promise<T> {
  const session = loadSession();
  const res = await fetch(`/api/sudoku${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.id}:${session.token}` } : {}),
      ...init.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && session) saveSession(null);
    throw new ApiRequestError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`, data as Record<string, unknown>);
  }
  return data as T;
}

export const post = <T>(path: string, body: unknown) => api<T>(path, { method: "POST", body: JSON.stringify(body) });

function subscribe(onChange: () => void) {
  window.addEventListener("sudoku-session", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("sudoku-session", onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readRawSession(): string {
  try {
    return localStorage.getItem(SESSION_KEY) ?? "";
  } catch {
    return "";
  }
}

/** The device's player identity, shared across tabs and components. */
export function usePlayer() {
  // `null` on the server and during hydration; a string once on the client.
  const raw = useSyncExternalStore(subscribe, readRawSession, () => null);
  const player = useMemo<PlayerSession | null>(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PlayerSession;
    } catch {
      return null;
    }
  }, [raw]);

  const register = useCallback(async (name: string) => {
    const current = loadSession();
    if (current) {
      const updated = await api<{ name: string }>("/players", { method: "PATCH", body: JSON.stringify({ name }) });
      saveSession({ ...current, name: updated.name });
    } else {
      saveSession(await post<PlayerSession>("/players", { name }));
    }
  }, []);

  /** Signs this device in as an existing player using a recovery code. */
  const restore = useCallback(async (code: string) => {
    const [id, token] = code.trim().split(".");
    if (!id || !token) throw new ApiRequestError(400, "That doesn't look like a recovery code");
    const res = await fetch("/api/sudoku/players", { cache: "no-store", headers: { Authorization: `Bearer ${id}:${token}` } });
    if (!res.ok) throw new ApiRequestError(res.status, "That recovery code isn't valid");
    const { name } = (await res.json()) as { name: string };
    saveSession({ id, token, name });
  }, []);

  return { player, ready: raw !== null, register, restore };
}

/** The code that signs another device in as this player. Keep it private. */
export function recoveryCode(player: PlayerSession): string {
  return `${player.id}.${player.token}`;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}
