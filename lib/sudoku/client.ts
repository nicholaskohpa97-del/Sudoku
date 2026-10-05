"use client";

import { useCallback, useSyncExternalStore } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { PlayerProfile } from "./types";

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Calls our API. The Supabase session travels in cookies, so no auth header is needed. */
export async function api<T>(path: string, init: RequestInit & { body?: string } = {}): Promise<T> {
  const res = await fetch(`/api/sudoku${path}`, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && auth.status === "signedIn") setAuth({ status: "signedOut" });
    throw new ApiRequestError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export const post = <T>(path: string, body: unknown) => api<T>(path, { method: "POST", body: JSON.stringify(body) });

// ---------------------------------------------------------------------------
// Auth state shared by every component (one Supabase listener per tab).

export type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; player: PlayerProfile }
  /** Supabase env vars missing in this build. */
  | { status: "unavailable" };

let auth: AuthState = { status: "loading" };
const SERVER_STATE: AuthState = { status: "loading" };
const listeners = new Set<() => void>();
let started = false;

function setAuth(next: AuthState) {
  auth = next;
  for (const l of listeners) l();
}

async function loadProfile() {
  try {
    setAuth({ status: "signedIn", player: await api<PlayerProfile>("/players") });
  } catch {
    setAuth({ status: "signedOut" });
  }
}

function start() {
  if (started) return;
  started = true;
  const supabase = supabaseBrowser();
  if (!supabase) {
    setAuth({ status: "unavailable" });
    return;
  }
  supabase.auth.onAuthStateChange((event, session) => {
    // Don't await Supabase calls inside this callback; defer our own work.
    setTimeout(() => {
      if (!session) setAuth({ status: "signedOut" });
      else if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || auth.status !== "signedIn") void loadProfile();
    }, 0);
  });
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  start();
  return () => listeners.delete(onChange);
}

/** The signed-in player, plus sign-in / sign-out / rename. */
export function usePlayer() {
  const state = useSyncExternalStore(
    subscribe,
    () => auth,
    () => SERVER_STATE,
  );

  const signIn = useCallback(async (next?: string) => {
    const supabase = supabaseBrowser();
    if (!supabase) throw new Error("Sign-in isn't configured yet");
    const back = next ?? `${window.location.pathname}${window.location.search}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(back)}` },
    });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    await supabaseBrowser()?.auth.signOut();
    setAuth({ status: "signedOut" });
  }, []);

  const rename = useCallback(async (name: string) => {
    const player = await api<PlayerProfile>("/players", { method: "PATCH", body: JSON.stringify({ name }) });
    setAuth({ status: "signedIn", player });
  }, []);

  return {
    status: state.status,
    player: state.status === "signedIn" ? state.player : null,
    ready: state.status !== "loading",
    signIn,
    signOut,
    rename,
  };
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}
