"use client";

import { Award, Brain, KeyRound, Pencil, Star } from "lucide-react";
import { useState } from "react";
import { formatDuration, recoveryCode, usePlayer } from "@/lib/sudoku/client";
import { DIFFICULTIES, DIFFICULTY_CONFIG, type Difficulty } from "@/lib/sudoku/engine";
import { useProgress } from "@/lib/sudoku/profile";
import { useSkill } from "@/lib/sudoku/skill";
import { TECHNIQUES, type TechniqueId } from "@/lib/sudoku/solver";
import { nextToLearn } from "@/lib/sudoku/strategy";
import { ACHIEVEMENTS, dayKey, liveStreak } from "@/lib/sudoku/progress";
import { loadStats, type SoloStats } from "@/lib/sudoku/stats";
import { NameForm } from "./NameGate";
import { PlayerCard } from "./SudokuHub";
import { DIFFICULTY_STYLE } from "./theme";
import { BackLink, Panel, SectionTitle, useIsClient } from "./ui";

export function ProfileScreen() {
  const { player, ready } = usePlayer();
  const progress = useProgress();
  const skill = useSkill();
  const isClient = useIsClient();
  const [editing, setEditing] = useState(false);
  const stats: Partial<Record<Difficulty, SoloStats>> = isClient ? loadStats() : {};
  const unlocked = new Set(progress?.achievements ?? []);
  const streak = progress ? liveStreak(progress, dayKey()) : 0;

  const tiles = [
    { label: "Points", value: (progress?.points ?? 0).toLocaleString("en-US") },
    { label: "Best chain", value: progress?.bestChain ?? 0 },
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
      <PlayerCard name={player?.name ?? null} large />

      {ready ? (
        <Panel className="space-y-3 !p-4">
          {editing || !player ? (
            <NameForm initial={player?.name ?? ""} submitLabel={player ? "Save" : "Set name"} onDone={() => setEditing(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center gap-2 text-sm font-semibold text-stone-300 hover:text-cyan-200"
            >
              <Pencil className="size-4" /> Change player name
            </button>
          )}
        </Panel>
      ) : null}

      {ready ? <RecoveryPanel /> : null}

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-center">
            <p className="font-num text-2xl font-bold text-cyan-200">{t.value}</p>
            <p className="text-[0.7rem] font-semibold text-stone-400">{t.label}</p>
          </div>
        ))}
      </div>

      <SkillPanel skill={skill} />

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
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
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
        Progress is saved on this device. No ads, no trackers.
      </p>
    </div>
  );
}

/** The techniques the player's own moves have shown, and the next one to learn. */
function SkillPanel({ skill }: { skill: ReturnType<typeof useSkill> }) {
  const entries = Object.entries(skill?.profile ?? {}) as [TechniqueId, { demonstrated: number; likely: number; possible: number }][];
  const shown = entries
    .filter(([, v]) => v.demonstrated + v.likely + v.possible > 0)
    .sort((a, b) => TECHNIQUES[b[0]].weight - TECHNIQUES[a[0]].weight);
  const next = skill ? nextToLearn(skill.profile) : null;
  return (
    <section className="space-y-3">
      <SectionTitle icon={<Brain />} tone="cyan">
        Your techniques
      </SectionTitle>
      {shown.length ? (
        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <ul className="space-y-1.5">
            {shown.slice(0, 8).map(([id, v]) => (
              <li key={id} className="flex items-center justify-between gap-2 text-sm">
                <span className="font-display font-semibold text-stone-100">{TECHNIQUES[id].name}</span>
                <span className="font-num text-xs font-semibold text-stone-400">
                  <span className="text-lime-300">{v.demonstrated} clear</span> · <span className="text-cyan-300">{v.likely} likely</span> ·{" "}
                  {v.possible} maybe
                </span>
              </li>
            ))}
          </ul>
          {next ? (
            <p className="rounded-xl bg-violet-300/10 px-3 py-2 text-xs font-semibold text-violet-100">
              Learn next: <span className="font-bold">{TECHNIQUES[next].name}</span>. {TECHNIQUES[next].blurb}
            </p>
          ) : null}
          <p className="text-[0.65rem] font-semibold text-stone-500">
            Inferred from your moves across {skill?.games ?? 0} solved {skill?.games === 1 ? "game" : "games"}.
          </p>
        </div>
      ) : (
        <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-semibold text-stone-400">
          Solve a Medium or harder puzzle and your moves will show which techniques you use.
        </p>
      )}
    </section>
  );
}

/** Move your identity (name, leaderboard scores, inbox) to another device. */
function RecoveryPanel() {
  const { player, restore } = usePlayer();
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  return (
    <Panel className="space-y-3 !p-4">
      <p className="flex items-center gap-2 font-display text-sm font-semibold text-stone-100">
        <KeyRound className="size-4 text-cyan-300" /> Recovery code
      </p>
      {player ? (
        <>
          <p className="text-xs font-semibold text-stone-400">
            Your name and scores live on this device. Keep this code to sign in as you on a new phone. Anyone who has it can play as you, so keep it private.
          </p>
          {shown ? (
            <div className="space-y-2">
              <code className="block rounded-xl bg-night/70 p-2 text-xs break-all text-cyan-200 select-all">{recoveryCode(player)}</code>
              <button
                type="button"
                className="text-xs font-semibold text-cyan-300 hover:text-cyan-100"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(recoveryCode(player));
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setShown(true)} className="text-sm font-semibold text-cyan-300 hover:text-cyan-100">
              Show my code
            </button>
          )}
        </>
      ) : null}
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            await restore(code);
            setRestored(true);
            setCode("");
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Paste a code to sign in here"
          aria-label="Recovery code"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-night/60 px-3 py-2 text-sm text-stone-100 placeholder:text-stone-500"
        />
        <button type="submit" disabled={!code.trim()} className="rounded-xl border border-white/15 bg-white/[0.07] px-3 text-sm font-semibold text-stone-100 disabled:opacity-40">
          Sign in
        </button>
      </form>
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      {restored ? <p className="text-xs font-semibold text-lime-300">Signed in.</p> : null}
    </Panel>
  );
}
