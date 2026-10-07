"use client";

import { Settings, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { setMuted, useMuted } from "@/lib/sudoku/sfx";
import { LIVES_OPTIONS, UNLIMITED_LIVES } from "@/lib/sudoku/scoring";
import { savePrefs, usePrefs } from "@/lib/sudoku/prefs";
import { BackLink, buttonStyles, Panel, SectionTitle } from "./ui";

function Toggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
      <span>
        <span className="block font-display text-sm font-semibold text-stone-100">{label}</span>
        {hint ? <span className="block text-xs font-semibold text-stone-400">{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={`relative h-7 w-12 shrink-0 rounded-full border transition ${on ? "border-cyan-300/60 bg-cyan-400/40" : "border-white/15 bg-white/10"}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-0.5"}`} />
      </button>
    </label>
  );
}

/** Keys that hold progress; the player identity and preferences are kept. */
const KEEP = ["sudoku.session.v1", "sudoku.prefs.v1", "sudoku.muted.v1"];

export function SettingsScreen() {
  const prefs = usePrefs();
  const muted = useMuted();
  const [confirming, setConfirming] = useState(false);

  const eraseLocalData = () => {
    try {
      for (const key of Object.keys(localStorage)) if (key.startsWith("sudoku.") && !KEEP.includes(key)) localStorage.removeItem(key);
    } catch {
      // Ignore storage failures.
    }
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <BackLink />
      <SectionTitle icon={<Settings />} tone="cyan">
        Settings
      </SectionTitle>

      <Panel className="space-y-4">
        <div>
          <p className="font-display text-sm font-semibold text-stone-100">Default lives</p>
          <p className="mb-2 text-xs font-semibold text-stone-400">Used when you start a new game. Fewer lives pay more points.</p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7" role="radiogroup" aria-label="Default lives">
            {[...LIVES_OPTIONS, UNLIMITED_LIVES].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={prefs.lives === n}
                aria-label={n === UNLIMITED_LIVES ? "Unlimited lives, practice" : `${n} ${n === 1 ? "life" : "lives"}`}
                onClick={() => savePrefs({ lives: n })}
                className={`rounded-xl border px-2 py-2 font-display text-lg font-bold transition ${
                  prefs.lives === n ? "border-transparent bg-cyan-300 text-night" : "border-white/10 bg-white/[0.04] text-stone-200 hover:bg-white/10"
                }`}
              >
                {n === UNLIMITED_LIVES ? "∞" : n}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      <Panel className="divide-y divide-white/10 !py-2">
        <Toggle label="Sound" hint="Move sounds, combos and the countdown." on={!muted} onChange={(v) => setMuted(!v)} />
        <Toggle label="Vibration" hint="Haptic taps on phones. Needs sound on." on={prefs.haptics} onChange={(v) => savePrefs({ haptics: v })} />
        <Toggle label="Show timer" hint="Hide it for a calmer game. Time still counts toward your score." on={prefs.showTimer} onChange={(v) => savePrefs({ showTimer: v })} />
        <Toggle label="Highlight row, column and box" hint="Tint the cells that see the selected cell." on={prefs.highlightRelated} onChange={(v) => savePrefs({ highlightRelated: v })} />
        <Toggle label="Highlight matching digits" hint="Tint every cell that holds the selected digit." on={prefs.highlightSame} onChange={(v) => savePrefs({ highlightSame: v })} />
      </Panel>

      <Panel className="space-y-2">
        <p className="font-display text-sm font-semibold text-stone-100">Player</p>
        <p className="text-xs font-semibold text-stone-400">Change your display name on your profile.</p>
        <Link href="/sudoku/profile" className={buttonStyles.secondary}>
          Open profile
        </Link>
      </Panel>

      <Panel className="space-y-3 border-rose-300/20">
        <p className="font-display text-sm font-semibold text-rose-200">Erase this device&apos;s game data</p>
        <p className="text-xs font-semibold text-stone-400">
          Removes history, stats, XP, achievements, your clear chain and saved games from this device. Your player name and settings stay.
          This can&apos;t be undone.
        </p>
        {confirming ? (
          <div className="flex gap-2">
            <button type="button" onClick={eraseLocalData} className={`${buttonStyles.danger} flex-1`}>
              <Trash2 className="size-4" /> Yes, erase
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={`${buttonStyles.secondary} flex-1`}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className={buttonStyles.danger}>
            <Trash2 className="size-4" /> Erase game data
          </button>
        )}
      </Panel>
    </div>
  );
}
