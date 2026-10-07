"use client";

import { Crown, Swords } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDuration, usePlayer } from "@/lib/sudoku/client";
import { DIFFICULTY_CONFIG } from "@/lib/sudoku/engine";
import { fetchDetail } from "@/lib/sudoku/leaderboard";
import type { ScoreDetail } from "@/lib/sudoku/types";
import { NameForm } from "./NameGate";
import { DIFFICULTY_STYLE } from "./theme";
import { BackLink, buttonStyles, Panel } from "./ui";

const MEDAL = ["🥇", "🥈", "🥉"];

/** One posted score: who, how, everyone else's result on the same puzzle, and a way to take it on. */
export function ScoreDetailScreen({ id }: { id: string }) {
  const { player, ready } = usePlayer();
  const [detail, setDetail] = useState<ScoreDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const playerId = player?.id;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    fetchDetail(id)
      .then((d) => !cancelled && setDetail(d))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [id, ready, playerId]);

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink href="/sudoku/leaderboard" label="Leaderboard" />
        <p className="rounded-2xl border border-rose-300/30 bg-rose-400/10 p-4 text-sm font-semibold text-rose-200">{error}</p>
      </div>
    );
  }
  if (!detail) return <p className="text-center text-sm font-semibold text-stone-500">Loading…</p>;

  const { entry: e, ladder, challenge } = detail;
  const style = DIFFICULTY_STYLE[e.difficulty];
  const facts = [
    ["Rating", e.rating.toFixed(1)],
    ["Time", `${formatDuration(e.elapsedMs)} (par ${formatDuration(e.parMs)})`],
    ["Lives", `${e.livesLost} lost of ${e.lives}`],
    ["Hints", String(e.hints)],
    ["Best combo", `×${e.maxCombo}`],
  ];

  return (
    <div className="space-y-5">
      <BackLink href="/sudoku/leaderboard" label="Leaderboard" />
      <Panel className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={`font-display text-sm font-semibold tracking-widest uppercase ${style.text}`}>{DIFFICULTY_CONFIG[e.difficulty].label}</p>
            <h1 className="truncate font-display text-3xl font-bold text-stone-50">
              {e.playerName}
              {e.mine ? " (you)" : ""}
            </h1>
            <p className="text-xs font-semibold text-stone-400">
              {new Date(e.at).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })}
              {e.source === "daily" ? " · daily puzzle" : e.source === "challenge" ? " · challenge result" : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="font-num text-4xl font-bold text-yellow-200 tabular-nums">{e.score.toLocaleString("en-US")}</p>
            <p className="text-xs font-semibold text-stone-400">points</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          {facts.map(([k, v]) => (
            <div key={k} className="rounded-xl bg-white/[0.05] px-3 py-2">
              <dt className="text-[0.7rem] font-semibold text-stone-400">{k}</dt>
              <dd className="font-display font-semibold text-stone-100">{v}</dd>
            </div>
          ))}
        </dl>

        {e.flagged ? (
          <p className="rounded-xl bg-yellow-300/10 p-3 text-xs font-semibold text-yellow-100">
            This run was faster than we can verify, so it&apos;s kept off the public boards.
          </p>
        ) : challenge.ok ? (
          <div className="space-y-2">
            <Link href={`/sudoku/challenge/${id}`} className={`${buttonStyles.primary} w-full`}>
              <Swords className="size-5" /> Challenge this score
            </Link>
            <p className="text-xs font-semibold text-stone-400">
              You play the exact same puzzle with the lives you choose. You get one scored attempt. Beat {e.playerName}&apos;s score to take the crown.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="rounded-xl bg-white/[0.05] p-3 text-sm font-semibold text-stone-300">{challenge.reason}</p>
            {!player ? <NameForm submitLabel="Save name" /> : null}
          </div>
        )}
      </Panel>

      <section className="space-y-2">
        <h2 className="font-display text-lg font-semibold text-stone-100">Everyone on this puzzle</h2>
        <ol className="space-y-1.5">
          {ladder.map((l) => (
            <li key={l.id}>
              <Link
                href={`/sudoku/leaderboard/${l.id}`}
                className={`flex items-center gap-3 rounded-2xl border p-2.5 text-sm ${l.id === e.id ? "border-yellow-300/50 bg-yellow-300/[0.07]" : l.mine ? "border-cyan-300/40 bg-cyan-300/[0.06]" : "border-white/10 bg-white/[0.03]"}`}
              >
                <span className="w-7 text-center font-num font-bold text-stone-300">{MEDAL[l.rank - 1] ?? l.rank}</span>
                <span className="min-w-0 flex-1 truncate font-display font-semibold text-stone-100">
                  {l.playerName}
                  {l.mine ? " (you)" : ""}
                </span>
                {l.rank === 1 ? <Crown className="size-4 text-yellow-300" /> : null}
                <span className="font-num font-bold text-yellow-200 tabular-nums">{l.score.toLocaleString("en-US")}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
