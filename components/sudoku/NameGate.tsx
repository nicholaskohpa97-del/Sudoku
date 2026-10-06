"use client";

import { useState } from "react";
import { usePlayer } from "@/lib/sudoku/client";
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
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await register(name);
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
        Pick the name your friends will see. No sign-up needed. It&apos;s remembered on this device.
      </p>
      <NameForm submitLabel="Continue" />
    </div>
  );
}
