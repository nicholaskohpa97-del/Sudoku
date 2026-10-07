"use client";

import { Crown, RefreshCw, Trophy } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatDuration } from "@/lib/sudoku/client";
import { DIFFICULTIES, DIFFICULTY_CONFIG, type Difficulty } from "@/lib/sudoku/engine";
import { fetchBoard } from "@/lib/sudoku/leaderboard";
import type { PlayerBoardRow, ScoreEntryView } from "@/lib/sudoku/types";
import { DIFFICULTY_STYLE } from "./theme";
import { BackLink, SectionTitle } from "./ui";

type Tab = "all" | "week" | "daily" | "players";
const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "Top scores" },
  { id: "week", label: "This week" },
  { id: "daily", label: "Daily" },
  { id: "players", label: "Players" },
];

const MEDAL = ["🥇", "🥈", "🥉"];

export function LeaderboardScreen() {
  const [tab, setTab] = useState<Tab>("all");
  const [tier, setTier] = useState<Difficulty | "all">("all");
  const [entries, setEntries] = useState<ScoreEntryView[] | null>(null);
  const [players, setPlayers] = useState<PlayerBoardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const t = tab === "daily" || tier === "all" ? undefined : tier;
      if (tab === "players") {
        setPlayers((await fetchBoard("players", t)).players);
        setEntries(null);
      } else {
        setEntries((await fetchBoard(tab, t)).entries);
        setPlayers(null);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }, [tab, tier]);

  useEffect(() => {
    // Loading a board is the one place state is set from an effect: it follows the tab and filter.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, tick]);

  return (
    <div className="space-y-5">
      <BackLink />
      <SectionTitle icon={<Trophy />} tone="gold">
        Leaderboard
      </SectionTitle>
      <p className="text-sm font-semibold text-stone-300">
        Scores are checked by replaying your moves. Tap a score to take on the same puzzle and try to take the crown.
      </p>

      <div className="flex gap-1 overflow-x-auto rounded-full border border-white/10 bg-white/[0.03] p-1 text-xs [scrollbar-width:none]" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 font-display font-semibold transition ${tab === t.id ? "bg-yellow-300 text-night" : "text-stone-400 hover:text-stone-100"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== "daily" ? (
        <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs [scrollbar-width:none]" aria-label="Level">
          {(["all", ...DIFFICULTIES] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={tier === d}
              onClick={() => setTier(d)}
              className={`shrink-0 rounded-full border px-3 py-1 font-display font-semibold transition ${
                tier === d ? (d === "all" ? "border-transparent bg-white text-night" : `border-transparent ${DIFFICULTY_STYLE[d].chip}`) : "border-white/10 text-stone-400 hover:text-stone-100"
              }`}
            >
              {d === "all" ? "All levels" : DIFFICULTY_CONFIG[d].label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex justify-end">
        <button type="button" onClick={() => setTick((n) => n + 1)} className="flex items-center gap-1 text-xs font-semibold text-stone-400 hover:text-cyan-200">
          <RefreshCw className="size-3.5" /> Refresh
        </button>
      </div>

      {error ? <p className="rounded-2xl border border-rose-300/30 bg-rose-400/10 p-4 text-sm font-semibold text-rose-200">{error}</p> : null}

      {entries && !error ? (
        entries.length ? (
          <ol className="space-y-2">
            {entries.map((e) => (
              <EntryRow key={e.id} e={e} />
            ))}
          </ol>
        ) : (
          <Empty daily={tab === "daily"} />
        )
      ) : null}

      {players && !error ? (
        players.length ? (
          <ol className="space-y-2">
            {players.map((p) => (
              <li
                key={p.playerId}
                className={`flex items-center gap-3 rounded-2xl border p-3 ${p.mine ? "border-cyan-300/50 bg-cyan-300/[0.08]" : "border-white/10 bg-white/[0.04]"}`}
              >
                <span className="w-8 text-center font-num text-lg font-bold text-stone-300">{MEDAL[p.rank - 1] ?? p.rank}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display font-semibold text-stone-100">
                    {p.playerName}
                    {p.mine ? " (you)" : ""}
                  </span>
                  <span className="block text-xs font-semibold text-stone-400">
                    {p.puzzles} {p.puzzles === 1 ? "puzzle" : "puzzles"} · best {p.best.toLocaleString("en-US")}
                  </span>
                </span>
                <span className="font-num text-lg font-bold text-yellow-200 tabular-nums">{p.total.toLocaleString("en-US")}</span>
              </li>
            ))}
          </ol>
        ) : (
          <Empty />
        )
      ) : null}

      {!entries && !players && !error ? <p className="text-center text-sm font-semibold text-stone-500">Loading…</p> : null}
    </div>
  );
}

function Empty({ daily }: { daily?: boolean }) {
  return (
    <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center text-sm font-semibold text-stone-400">
      {daily ? "Nobody has posted today's daily yet. Be the first." : "Nothing here yet. Finish a puzzle and post it to start the board."}
    </p>
  );
}

function EntryRow({ e }: { e: ScoreEntryView }) {
  const style = DIFFICULTY_STYLE[e.difficulty];
  return (
    <li>
      <Link
        href={`/sudoku/leaderboard/${e.id}`}
        className={`flex items-center gap-3 rounded-2xl border p-3 transition hover:bg-white/[0.07] ${e.mine ? "border-cyan-300/50 bg-cyan-300/[0.08]" : "border-white/10 bg-white/[0.04]"}`}
      >
        <span className="w-8 text-center font-num text-lg font-bold text-stone-300">{MEDAL[e.rank - 1] ?? e.rank}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-display font-semibold text-stone-100">
              {e.playerName}
              {e.mine ? " (you)" : ""}
            </span>
            {e.rank === 1 ? <Crown className="size-4 shrink-0 text-yellow-300" /> : null}
          </span>
          <span className="block text-xs font-semibold text-stone-400">
            <span className={style.text}>{DIFFICULTY_CONFIG[e.difficulty].label}</span> · rating {e.rating.toFixed(1)} · {formatDuration(e.elapsedMs)} · {e.livesLost}/{e.lives} lives
            {e.hints ? ` · ${e.hints} ${e.hints === 1 ? "hint" : "hints"}` : ""}
          </span>
        </span>
        <span className="text-right">
          <span className="block font-num text-lg font-bold text-yellow-200 tabular-nums">{e.score.toLocaleString("en-US")}</span>
          <span className="block text-[0.65rem] font-semibold text-stone-500">{e.source === "daily" ? "daily" : e.source === "challenge" ? "challenge" : "points"}</span>
        </span>
      </Link>
    </li>
  );
}
