"use client";

import { Award, LogOut, Pencil, Star } from "lucide-react";
import { useState } from "react";
import { formatDuration, usePlayer } from "@/lib/sudoku/client";
import { DIFFICULTIES, DIFFICULTY_CONFIG, type Difficulty } from "@/lib/sudoku/engine";
import { useProgress } from "@/lib/sudoku/profile";
import { ACHIEVEMENTS, dayKey, liveStreak } from "@/lib/sudoku/progress";
import { loadStats, type SoloStats } from "@/lib/sudoku/stats";
import { GoogleButton, NameForm } from "./NameGate";
import { PlayerCard } from "./SudokuHub";
import { DIFFICULTY_STYLE } from "./theme";
import { BackLink, Panel, SectionTitle, useIsClient } from "./ui";

export function ProfileScreen() {
  const { player, ready, signOut } = usePlayer();
  const progress = useProgress();
  const isClient = useIsClient();
  const [editing, setEditing] = useState(false);
  const stats: Partial<Record<Difficulty, SoloStats>> = isClient ? loadStats() : {};
  const unlocked = new Set(progress?.achievements ?? []);
  const streak = progress ? liveStreak(progress, dayKey()) : 0;

  const tiles = [
    { label: "Puzzles solved", value: progress?.solves ?? 0 },
    { label: "Flawless", value: progress?.flawless ?? 0 },
    { label: "Best combo", value: `×${progress?.bestCombo ?? 0}` },
    { label: "Streak", value: `${streak} 🔥` },
    { label: "Best streak", value: progress?.bestStreak ?? 0 },
    { label: "Race wins", value: progress?.roomWins ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <BackLink />
      <PlayerCard name={player?.name ?? null} avatarUrl={player?.avatarUrl} seed={player?.id} large />

      {ready ? (
        <Panel className="space-y-3 !p-4">
          {!player ? (
            <>
              <p className="text-sm font-semibold text-stone-300">Sign in to race friends and join tournaments.</p>
              <GoogleButton />
            </>
          ) : editing ? (
            <NameForm initial={player.name} onDone={() => setEditing(false)} />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex items-center gap-2 text-sm font-semibold text-stone-300 hover:text-cyan-200"
              >
                <Pencil className="size-4" /> Change player name
              </button>
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex items-center gap-2 text-sm font-semibold text-stone-400 hover:text-rose-200"
              >
                <LogOut className="size-4" /> Sign out
              </button>
            </div>
          )}
        </Panel>
      ) : null}

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-center">
            <p className="font-num text-2xl font-bold text-cyan-200">{t.value}</p>
            <p className="text-[0.7rem] font-semibold text-stone-400">{t.label}</p>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <SectionTitle icon={<Award />} tone="gold">
          Achievements · {unlocked.size}/{ACHIEVEMENTS.length}
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ACHIEVEMENTS.map((a) => {
            const got = unlocked.has(a.id);
            return (
              <div
                key={a.id}
                className={`rounded-2xl border-2 p-4 transition ${
                  got
                    ? "border-yellow-300/50 bg-yellow-300/[0.07] shadow-[0_0_24px_-8px_rgb(250_204_21/0.6)]"
                    : "border-white/5 bg-white/[0.02] opacity-60"
                }`}
              >
                <p className={`text-3xl ${got ? "" : "grayscale"}`}>{got ? a.emoji : "🔒"}</p>
                <p className="mt-1 font-display font-semibold">{a.name}</p>
                <p className="text-xs font-semibold text-stone-400">{a.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle icon={<Star />} tone="cyan">
          Solo records
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {DIFFICULTIES.map((d) => {
            const s = stats[d];
            return (
              <div key={d} className={`rounded-2xl border-2 bg-gradient-to-b p-4 ${DIFFICULTY_STYLE[d].border} ${DIFFICULTY_STYLE[d].gradient}`}>
                <p className={`font-display text-lg font-bold ${DIFFICULTY_STYLE[d].text}`}>{DIFFICULTY_CONFIG[d].label}</p>
                <p className="font-num text-sm font-semibold text-stone-300">
                  {s?.played ? `${s.won}/${s.played} won` : "Not played yet"}
                </p>
                <p className="font-num text-xs font-semibold text-stone-400">
                  Best {s?.bestMs != null ? formatDuration(s.bestMs) : "—"}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-center text-xs font-semibold text-stone-500">
        XP and achievements are saved on this device. No ads, no trackers.
      </p>
    </div>
  );
}
