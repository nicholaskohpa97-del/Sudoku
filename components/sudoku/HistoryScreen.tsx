"use client";

import { ChevronDown, ChevronUp, History, Link2, Lock, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDuration } from "@/lib/sudoku/client";
import { DIFFICULTIES, DIFFICULTY_CONFIG, type Difficulty } from "@/lib/sudoku/engine";
import { useHistory, type GameResult, type HistoryRecord } from "@/lib/sudoku/history";
import { loadLog } from "@/lib/sudoku/logs";
import { TECHNIQUES } from "@/lib/sudoku/solver";
import { PostScorePanel } from "./PostScorePanel";
import { DIFFICULTY_STYLE } from "./theme";
import { BackLink, Field, inputStyles, Panel, SectionTitle } from "./ui";

const KIND_LABEL: Record<HistoryRecord["kind"], string> = { classic: "Single player", daily: "Daily", ascent: "Ascent", replay: "Replay", challenge: "Challenge" };

const RESULT_STYLE: Record<GameResult, string> = {
  won: "bg-lime-300/15 text-lime-200",
  lost: "bg-rose-400/15 text-rose-200",
  revealed: "bg-violet-300/15 text-violet-200",
};
const RESULT_LABEL: Record<GameResult, string> = { won: "Solved", lost: "Out of lives", revealed: "Revealed" };

const EVIDENCE = { demonstrated: "clearly used", likely: "probably", possible: "maybe" } as const;

function when(at: number): string {
  return new Date(at).toLocaleString("en-SG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function HistoryScreen() {
  const history = useHistory();
  const [result, setResult] = useState<"all" | GameResult>("all");
  const [kind, setKind] = useState<"all" | HistoryRecord["kind"]>("all");
  const [tier, setTier] = useState<"all" | Difficulty>("all");
  const [open, setOpen] = useState<string | null>(null);

  const records = useMemo(() => history?.records ?? [], [history]);
  const shown = useMemo(
    () =>
      records.filter(
        (r) => (result === "all" || r.result === result) && (kind === "all" || r.kind === kind) && (tier === "all" || r.difficulty === tier),
      ),
    [records, result, kind, tier],
  );

  const won = records.filter((r) => r.result === "won");
  const tiles = [
    { label: "Games", value: records.length },
    { label: "Solved", value: won.length },
    { label: "Win rate", value: records.length ? `${Math.round((won.length / records.length) * 100)}%` : "—" },
    { label: "Play time", value: formatDuration(records.reduce((t, r) => t + r.elapsedMs, 0)) },
  ];

  return (
    <div className="space-y-6">
      <BackLink />
      <SectionTitle icon={<History />} tone="cyan">
        Game history
      </SectionTitle>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-center">
            <p className="font-num text-2xl font-bold text-cyan-200">{t.value}</p>
            <p className="text-[0.7rem] font-semibold text-stone-400">{t.label}</p>
          </div>
        ))}
      </div>

      <Panel className="grid grid-cols-3 gap-3 !p-4">
        <Field label="Result">
          <select className={inputStyles} value={result} onChange={(e) => setResult(e.target.value as typeof result)}>
            <option value="all">All</option>
            <option value="won">Solved</option>
            <option value="lost">Out of lives</option>
            <option value="revealed">Revealed</option>
          </select>
        </Field>
        <Field label="Mode">
          <select className={inputStyles} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="all">All</option>
            {Object.entries(KIND_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Level">
          <select className={inputStyles} value={tier} onChange={(e) => setTier(e.target.value as typeof tier)}>
            <option value="all">All</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {DIFFICULTY_CONFIG[d].label}
              </option>
            ))}
          </select>
        </Field>
      </Panel>

      {history === null ? null : shown.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center text-sm font-semibold text-stone-400">
          {records.length ? "No games match these filters." : "No games yet. Finish a puzzle and it will show up here."}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((r) => (
            <HistoryRow key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function HistoryRow({ r, open, onToggle }: { r: HistoryRecord; open: boolean; onToggle: () => void }) {
  const style = DIFFICULTY_STYLE[r.difficulty];
  const livesText = r.lives === 0 ? "∞ lives" : `${Math.max(0, r.lives - r.livesLost)}/${r.lives} lives left`;
  return (
    <li className={`rounded-2xl border-2 bg-gradient-to-b ${style.border.split(" ")[0]} ${style.gradient}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`font-display text-lg font-bold ${style.text}`}>{DIFFICULTY_CONFIG[r.difficulty].label}</span>
            <span className="font-num text-xs font-semibold text-stone-400">rating {r.rating.toFixed(1)}</span>
            <span className={`rounded-full px-2 py-0.5 text-[0.7rem] font-bold ${RESULT_STYLE[r.result]}`}>{RESULT_LABEL[r.result]}</span>
            {r.chain ? (
              <span className="flex items-center gap-0.5 rounded-full bg-yellow-300/15 px-2 py-0.5 text-[0.7rem] font-bold text-yellow-200">
                <Link2 className="size-3" />
                {r.chain.count}
              </span>
            ) : null}
          </p>
          <p className="text-xs font-semibold text-stone-400">
            {when(r.at)} · {KIND_LABEL[r.kind]}
            {r.level ? ` · level ${r.level}` : ""} · {formatDuration(r.elapsedMs)} (par {formatDuration(r.parMs)})
          </p>
        </div>
        <div className="text-right">
          <p className="font-num text-lg font-bold text-cyan-200 tabular-nums">{r.result === "won" ? r.score.toLocaleString("en-US") : "—"}</p>
          <p className="text-[0.65rem] font-semibold text-stone-500">points</p>
        </div>
        {open ? <ChevronUp className="size-4 text-stone-400" /> : <ChevronDown className="size-4 text-stone-400" />}
      </button>

      {open ? (
        <div className="space-y-2 border-t border-white/10 p-3 text-xs font-semibold text-stone-300">
          <p>
            {livesText} · {r.livesLost} lost · {r.hints} {r.hints === 1 ? "hint" : "hints"} · best combo ×{r.maxCombo}
            {r.chain ? ` · chain ${r.chain.count} (×${r.chain.multiplier}, +${r.chain.awarded.toLocaleString("en-US")} banked)` : ""}
          </p>
          {r.strategy ? (
            <div className="space-y-1">
              {r.strategy.techniques.length ? (
                <p className="flex flex-wrap gap-1">
                  {r.strategy.techniques.map((t) => (
                    <span key={t.technique} className="rounded-full bg-white/10 px-2 py-0.5 text-[0.7rem] font-bold text-stone-200">
                      {TECHNIQUES[t.technique].name} · {EVIDENCE[t.evidence]}
                    </span>
                  ))}
                </p>
              ) : (
                <p className="text-stone-400">Singles only.</p>
              )}
              <p className="text-stone-400">
                {r.strategy.guesses} {r.strategy.guesses === 1 ? "guess" : "guesses"} ·{" "}
                {r.strategy.style === "too-short" ? "too short to read a style" : `${r.strategy.style.replace("-", " ")} scanning`}
              </p>
            </div>
          ) : r.result === "won" ? (
            <p className="text-stone-500">No strategy report was saved for this game.</p>
          ) : null}
          {r.result === "won" && (r.kind === "classic" || r.kind === "daily") && r.lives > 0 ? <PostFromHistory r={r} /> : null}
          {r.result === "revealed" ? (
            <p className="flex items-center gap-1.5 text-violet-200">
              <Lock className="size-3.5" /> Locked: you revealed this solution, so it can&apos;t be replayed.
            </p>
          ) : (
            <Link
              href={`/sudoku/replay/${r.id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/40 bg-cyan-300/10 px-3 py-1.5 font-display text-sm font-semibold text-cyan-200 hover:bg-cyan-300/20"
            >
              <RotateCcw className="size-3.5" /> Play this puzzle again (unscored)
            </Link>
          )}
        </div>
      ) : null}
    </li>
  );
}

/** Posting a past win needs its move log, which is only kept for the latest few games. */
function PostFromHistory({ r }: { r: HistoryRecord }) {
  const log = loadLog(r.id);
  if (!log && !r.posted) {
    return <p className="text-stone-500">This game is too old to post: move logs are kept for your latest wins only.</p>;
  }
  return (
    <PostScorePanel
      recordId={r.id}
      posted={r.posted}
      submission={{ baseId: r.baseId, seed: r.seed, lives: r.lives, log: log ?? [], daily: r.daily }}
    />
  );
}
