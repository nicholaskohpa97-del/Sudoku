"use client";

import { useState } from "react";
import { usePlayer } from "@/lib/sudoku/client";
import { buttonStyles, Field, inputStyles } from "./ui";

/** Rename form for the signed-in player. */
export function NameForm({
  initial = "",
  submitLabel = "Save",
  onDone,
}: {
  initial?: string;
  submitLabel?: string;
  onDone?: () => void;
}) {
  const { rename } = usePlayer();
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await rename(name);
          onDone?.();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex-1">
        <Field label="Player name">
          <input
            className={inputStyles}
            value={name}
            maxLength={24}
            placeholder="e.g. Auntie May"
            onChange={(e) => setName(e.target.value)}
            autoComplete="nickname"
            required
          />
        </Field>
        {error ? <p className="mt-1.5 text-sm text-rose-300">{error}</p> : null}
      </div>
      <button type="submit" disabled={busy || !name.trim()} className={buttonStyles.primary}>
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}

/** "Continue with Google". Returns to `next` (default: this page) after sign-in. */
export function GoogleButton({ next, className = "" }: { next?: string; className?: string }) {
  const { signIn, status } = usePlayer();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (status === "unavailable") {
    return (
      <p className="rounded-2xl border border-yellow-300/30 bg-yellow-300/10 p-3 text-sm font-semibold text-yellow-100">
        Sign-in isn&apos;t set up on this server yet (Supabase environment variables are missing).
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await signIn(next);
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
        className={`inline-flex items-center justify-center gap-3 rounded-2xl bg-white px-5 py-3 font-display font-semibold text-slate-800 shadow-[0_4px_0_0_#94a3b8] transition-all duration-100 hover:brightness-95 active:translate-y-[3px] active:shadow-[0_1px_0_0_#94a3b8] disabled:opacity-60 ${className}`}
      >
        <GoogleLogo /> {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}

/** Shown after a failed Google round-trip (the callback adds ?signin=failed). */
function SignInFailedNote() {
  const failed = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("signin") === "failed";
  return failed ? <p className="text-sm font-semibold text-rose-300">Sign-in didn&apos;t complete. Please try again.</p> : null;
}

/** Renders children once the player is signed in; otherwise asks them to sign in with Google. */
export function NameGate({ title, children }: { title: string; children: React.ReactNode }) {
  const { player, ready } = usePlayer();
  if (!ready) return <p className="text-center font-semibold text-stone-400">Loading…</p>;
  if (player) return <>{children}</>;
  return (
    <div className="animate-rise mx-auto max-w-md space-y-4 rounded-3xl border-2 border-pink-300/40 bg-gradient-to-b from-pink-500/15 to-white/[0.02] p-6 shadow-[0_0_40px_-12px_rgb(244_114_182/0.6)]">
      <p className="text-4xl">🎮</p>
      <h1 className="font-display text-3xl font-bold">{title}</h1>
      <p className="text-sm font-semibold text-stone-300">
        Sign in with Google so your friends can see you in the race. You&apos;ll come straight back here.
      </p>
      <SignInFailedNote />
      <GoogleButton className="w-full" />
    </div>
  );
}
