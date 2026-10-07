"use client";

import { Dices, VenetianMask } from "lucide-react";
import { useState } from "react";
import { ApiRequestError, usePlayer } from "@/lib/sudoku/client";
import { anonymousName, randomName } from "@/lib/sudoku/names";
import { buttonStyles, Field, inputStyles } from "./ui";

export function NameForm({
  initial = "",
  submitLabel = "Save",
  onDone,
}: {
  initial?: string;
  submitLabel?: string;
  onDone?: () => void;
}) {
  const { register } = usePlayer();
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  /** Saves `chosen`; on a clash shows the server's free alternatives. */
  async function save(chosen: string) {
    setBusy(true);
    setError(null);
    setSuggestions([]);
    try {
      await register(chosen);
      onDone?.();
    } catch (err) {
      setError((err as Error).message);
      if (err instanceof ApiRequestError && Array.isArray(err.data.suggestions)) setSuggestions(err.data.suggestions as string[]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        void save(name);
      }}
    >
      <div className="flex-1 space-y-2">
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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setName(randomName(Math.random, true));
              setError(null);
              setSuggestions([]);
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold text-stone-200 transition hover:bg-white/10"
          >
            <Dices className="size-3.5" /> Random name
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const anon = anonymousName();
              setName(anon);
              void save(anon);
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold text-stone-200 transition hover:bg-white/10 disabled:opacity-50"
          >
            <VenetianMask className="size-3.5" /> Stay anonymous
          </button>
        </div>
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        {suggestions.length ? (
          <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-stone-300">
            Free right now:
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setName(s);
                  void save(s);
                }}
                className="rounded-full bg-cyan-300/15 px-2.5 py-1 font-bold text-cyan-200 hover:bg-cyan-300/25"
              >
                {s}
              </button>
            ))}
          </p>
        ) : null}
      </div>
      <button type="submit" disabled={busy || !name.trim()} className={buttonStyles.primary}>
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

/** Renders children once the device has a player name; otherwise asks for one. */
export function NameGate({ title, children }: { title: string; children: React.ReactNode }) {
  const { player, ready } = usePlayer();
  if (!ready) return null;
  if (player) return <>{children}</>;
  return (
    <div className="animate-rise mx-auto max-w-md space-y-4 rounded-3xl border-2 border-pink-300/40 bg-gradient-to-b from-pink-500/15 to-white/[0.02] p-6 shadow-[0_0_40px_-12px_rgb(244_114_182/0.6)]">
      <p className="text-4xl">🎮</p>
      <h1 className="font-display text-3xl font-bold">{title}</h1>
      <p className="text-sm font-semibold text-stone-300">
        Pick the name other players will see, make one up, or stay anonymous. Names are unique. No sign-up needed. It&apos;s remembered on this device.
      </p>
      <NameForm submitLabel="Continue" />
    </div>
  );
}
