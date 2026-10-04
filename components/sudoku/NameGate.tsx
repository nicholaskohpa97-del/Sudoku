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
        <Field label="Display name">
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
    <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-white/10 bg-white/[0.035] p-6">
      <h1 className="font-display text-3xl">{title}</h1>
      <p className="text-sm text-stone-400">
        Pick the name your friends will see. No sign-up, email or password — it&apos;s remembered on this device.
      </p>
      <NameForm submitLabel="Continue" />
    </div>
  );
}
