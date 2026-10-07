"use client";

import { Check, ChevronDown, ChevronUp, Flame, Lightbulb, Link2, Play, ShieldAlert } from "lucide-react";
import { useState } from "react";
import type { AscentRun } from "@/lib/sudoku/ascent";
import { DIFFICULTIES, DIFFICULTY_CONFIG, type Difficulty } from "@/lib/sudoku/engine";
import type { HintView } from "@/lib/sudoku/game";
import { LIVES_OPTIONS, livesChosenFactor, MAX_HINTS, UNLIMITED_LIVES, type ScoreBreakdown } from "@/lib/sudoku/scoring";
import { TECHNIQUES } from "@/lib/sudoku/solver";
import type { StrategyReport } from "@/lib/sudoku/strategy";
import { DIFFICULTY_STYLE } from "./theme";
import { buttonStyles } from "./ui";

const fmt = (n: number) => n.toLocaleString("en-US");

/** Before a new game: choose how many lives to play with. Fewer lives pay more. */
export function PreGame({
  difficulty,
  daily,
  lives,
  onLives,
  onStart,
  kicker,
  heading,
  blurb,
  needs,
  note,
  noUnlimited,
  startLabel = "Start",
  question = "How many lives?",
}: {
  difficulty: Difficulty;
  daily?: boolean;
  lives: number;
  onLives: (n: number) => void;
  onStart: () => void;
  /** Small label above the heading (default: "New game" or "Daily puzzle"). */
  kicker?: string;
  heading?: string;
  blurb?: string;
  needs?: string;
  note?: string;
  /** Hide the unlimited/practice option (Ascent needs a real pool). */
  noUnlimited?: boolean;
  startLabel?: string;
  question?: string;
}) {
  const style = DIFFICULTY_STYLE[difficulty];
  const config = DIFFICULTY_CONFIG[difficulty];
  return (
    <div className="mx-auto w-full max-w-[min(92vw,30rem)] space-y-5 rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-5">
      <div>
        <p className="font-display text-xs font-semibold tracking-widest text-stone-400 uppercase">{kicker ?? (daily ? "Daily puzzle" : "New game")}</p>
        <h2 className={`font-display text-3xl font-bold ${style.text}`}>{heading ?? config.label}</h2>
        <p className="text-sm font-semibold text-stone-300">{blurb ?? config.blurb}</p>
        <p className="mt-1 text-xs font-semibold text-stone-500">{needs ?? `Needs: ${config.needs}`}</p>
      </div>

      <div className="space-y-2">
        <p className="font-display text-sm font-semibold text-stone-200">{question}</p>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Lives">
          {(noUnlimited ? [...LIVES_OPTIONS] : [...LIVES_OPTIONS, UNLIMITED_LIVES]).map((n) => {
            const on = n === lives;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={n === UNLIMITED_LIVES ? "Unlimited lives, practice, no points" : `${n} ${n === 1 ? "life" : "lives"}, ${livesChosenFactor(n)} times points`}
                onClick={() => onLives(n)}
                className={`rounded-2xl border px-2 py-2.5 text-center transition ${
                  on ? `${style.chip} border-transparent` : "border-white/10 bg-white/[0.04] text-stone-200 hover:bg-white/10"
                }`}
              >
                <span className="block font-display text-xl leading-none font-bold">{n === UNLIMITED_LIVES ? "∞" : n}</span>
                <span className={`mt-1 block font-num text-[0.7rem] font-semibold ${on ? "opacity-80" : "text-stone-400"}`}>
                  {n === UNLIMITED_LIVES ? "practice" : `×${livesChosenFactor(n)} pts`}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-xs font-semibold text-stone-400">
          {note ?? "Every wrong digit costs a life. Fewer lives, more points. Practice scores nothing."}
        </p>
      </div>

      <button type="button" onClick={onStart} className={`${buttonStyles.primary} w-full`}>
        <Play className="size-5" /> {startLabel}
      </button>
    </div>
  );
}

const LEVEL_TITLE = ["", "Where to look", "What to look for", "The pattern"];

/** The current hint, with its level. Never states the digit to enter. */
export function HintPanel({ view, left }: { view: HintView; left: number }) {
  return (
    <div className="animate-rise mx-auto w-full max-w-[min(92vw,30rem)] space-y-1.5 rounded-2xl border border-yellow-300/30 bg-yellow-300/[0.07] p-3" role="status">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-display text-sm font-bold text-yellow-200">
          <Lightbulb className="size-4" /> {LEVEL_TITLE[view.level]}
          {view.level >= 2 && view.technique !== "naked-single" && view.technique !== "hidden-single" ? (
            <span className="font-semibold text-yellow-100/70">· {TECHNIQUES[view.technique as keyof typeof TECHNIQUES]?.name}</span>
          ) : null}
        </p>
        <span className="flex items-center gap-1" aria-label={`Hint ${view.level} of 3, ${left} hints left in this game`}>
          {Array.from({ length: 3 }, (_, k) => (
            <span key={k} className={`size-2 rounded-full ${k < view.level ? "bg-yellow-300" : "bg-white/15"}`} />
          ))}
        </span>
      </div>
      <p className="text-sm font-semibold text-stone-100">{view.text}</p>
      <p className="text-[0.7rem] font-semibold text-stone-400">
        {left} of {MAX_HINTS} hints left. Press Hint again for more detail on this step.
      </p>
    </div>
  );
}

/** Score, with the breakdown one tap away. */
export function ScoreView({
  score,
  chain,
}: {
  score: ScoreBreakdown;
  chain: { count: number; multiplier: number; awarded: number } | null;
}) {
  const [open, setOpen] = useState(false);
  if (score.total === 0 && !chain) {
    return <p className="rounded-xl bg-white/[0.05] px-3 py-2 text-xs font-semibold text-stone-300">Practice game: no points.</p>;
  }
  return (
    <div className="animate-rise space-y-1.5 rounded-2xl border border-cyan-300/30 bg-cyan-300/[0.07] px-3 py-2 text-left [animation-delay:300ms]">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-xs font-semibold text-cyan-100/80">Puzzle score</span>
        <span className="font-num text-2xl font-bold text-cyan-200 tabular-nums">{fmt(score.total)}</span>
      </div>
      {chain ? (
        <div className="flex items-center justify-between rounded-lg bg-yellow-300/10 px-2 py-1 text-xs font-bold text-yellow-200">
          <span className="flex items-center gap-1">
            <Link2 className="size-3.5" /> Clear chain {chain.count} · ×{chain.multiplier}
          </span>
          <span className="font-num">+{fmt(chain.awarded)} banked</span>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-center gap-1 text-[0.7rem] font-semibold text-cyan-100/70 hover:text-cyan-100"
      >
        {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />} How it was scored
      </button>
      {open ? (
        <ul className="space-y-0.5 text-xs font-semibold text-stone-300">
          {score.lines.map((l) => (
            <li key={l.label} className="flex justify-between gap-2">
              <span>{l.label}</span>
              <span className="font-num text-cyan-200">{l.value}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const EVIDENCE_STYLE = {
  demonstrated: "bg-lime-300/20 text-lime-200",
  likely: "bg-cyan-300/20 text-cyan-200",
  possible: "bg-white/10 text-stone-300",
  "not-seen": "bg-rose-400/15 text-rose-200",
} as const;

const EVIDENCE_LABEL = { demonstrated: "clearly used", likely: "probably", possible: "maybe", "not-seen": "not seen" } as const;

/** What the moves say about how the puzzle was solved. */
export function StrategyView({ report }: { report: StrategyReport | null }) {
  const [open, setOpen] = useState(false);
  if (!report) {
    return <p className="rounded-xl bg-white/[0.05] px-3 py-2 text-xs font-semibold text-stone-400">Analysing how you solved it…</p>;
  }
  return (
    <div className="animate-rise space-y-1.5 rounded-2xl border border-violet-300/30 bg-violet-300/[0.07] px-3 py-2 text-left">
      <p className="flex items-center gap-1.5 font-display text-xs font-semibold text-violet-100/90">
        <Flame className="size-3.5" /> How you solved it
      </p>
      {report.techniques.length ? (
        <p className="flex flex-wrap gap-1">
          {report.techniques.map((t) => (
            <span key={t.technique} className={`rounded-full px-2 py-0.5 text-[0.7rem] font-bold ${EVIDENCE_STYLE[t.evidence]}`}>
              {TECHNIQUES[t.technique].name} · {EVIDENCE_LABEL[t.evidence]}
            </span>
          ))}
        </p>
      ) : (
        <p className="text-xs font-semibold text-stone-300">No techniques beyond singles showed up in your moves.</p>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-center gap-1 text-[0.7rem] font-semibold text-violet-100/70 hover:text-violet-100"
      >
        {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />} Full report
      </button>
      {open ? (
        <div className="space-y-1.5">
          <ul className="list-disc space-y-0.5 pl-4 text-xs font-semibold text-stone-300">
            {report.summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {report.forced.length ? (
            <div>
              <p className="text-[0.7rem] font-semibold text-stone-400">The puzzle itself forced:</p>
              <p className="mt-0.5 flex flex-wrap gap-1">
                {report.forced.map((f) => (
                  <span key={f.technique} className={`rounded-full px-2 py-0.5 text-[0.7rem] font-bold ${EVIDENCE_STYLE[f.evidence]}`}>
                    {TECHNIQUES[f.technique].name} · {EVIDENCE_LABEL[f.evidence]}
                  </span>
                ))}
              </p>
            </div>
          ) : null}
          <p className="text-[0.65rem] font-semibold text-stone-500">
            Inferred from your moves, not certain: a quick move with no pencil marks could be intuition or a guess.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Confirmation before revealing the solution. */
export function GiveUpConfirm({ onConfirm, onCancel, chain }: { onConfirm: () => void; onCancel: () => void; chain: number }) {
  return (
    <div className="animate-rise mx-auto w-full max-w-[min(92vw,30rem)] space-y-2 rounded-2xl border border-rose-300/40 bg-rose-400/[0.08] p-3" role="alertdialog" aria-label="Show solution?">
      <p className="flex items-center gap-1.5 font-display text-sm font-bold text-rose-200">
        <ShieldAlert className="size-4" /> Show the solution?
      </p>
      <ul className="list-disc space-y-0.5 pl-4 text-xs font-semibold text-stone-200">
        <li>You&apos;ll get a step-by-step walkthrough from where you are.</li>
        <li>This puzzle scores 0 and you can&apos;t play it again.</li>
        <li>{chain > 0 ? `Your clear chain of ${chain} stays, and you get a brand-new puzzle next.` : "You get a brand-new puzzle next."}</li>
      </ul>
      <div className="flex gap-2">
        <button type="button" onClick={onConfirm} className={`${buttonStyles.secondary} flex-1`}>
          Show solution
        </button>
        <button type="button" onClick={onCancel} className={`${buttonStyles.primary} flex-1`}>
          Keep playing
        </button>
      </div>
    </div>
  );
}

/** The six rungs of an Ascent run: cleared, current and still to come. */
export function AscentLadder({ run, current }: { run: AscentRun | null; current: Difficulty }) {
  const currentIndex = DIFFICULTIES.indexOf(current);
  return (
    <div className="flex max-w-full gap-1 overflow-x-auto rounded-full border border-white/10 bg-white/[0.03] p-1 text-xs [scrollbar-width:none]" aria-label="Ascent progress">
      {DIFFICULTIES.map((d, i) => {
        const done = !!run && i <= run.topCleared;
        const here = i === currentIndex;
        return (
          <span
            key={d}
            aria-current={here ? "step" : undefined}
            className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 font-display font-semibold ${
              here ? DIFFICULTY_STYLE[d].chip : done ? "text-lime-300" : "text-stone-500"
            }`}
          >
            {done && !here ? <Check className="size-3" /> : null}
            {DIFFICULTY_CONFIG[d].label}
          </span>
        );
      })}
    </div>
  );
}

/** Shown when the shared pool of lives runs out. */
export function RunOver({
  run,
  best,
  onNew,
}: {
  run: AscentRun;
  best: { points: number; cleared: number; topCleared: number } | null;
  onNew: () => void;
}) {
  const top = run.topCleared >= 0 ? DIFFICULTY_CONFIG[DIFFICULTIES[run.topCleared]].label : "none yet";
  const record = !!best && run.points >= best.points && run.points > 0;
  return (
    <div className="w-full max-w-xs space-y-3 px-4 text-center">
      <p className="text-5xl">🏔️</p>
      <h2 className="font-display text-3xl font-bold text-violet-200">Run over</h2>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-white/[0.06] p-2">
          <p className="font-num text-xl font-bold text-cyan-200">{run.cleared}</p>
          <p className="text-[0.65rem] font-semibold text-stone-400">cleared</p>
        </div>
        <div className="rounded-xl bg-white/[0.06] p-2">
          <p className="font-display text-sm leading-7 font-bold text-pink-200">{top}</p>
          <p className="text-[0.65rem] font-semibold text-stone-400">highest tier</p>
        </div>
        <div className="rounded-xl bg-white/[0.06] p-2">
          <p className="font-num text-xl font-bold text-yellow-200">{fmt(run.points)}</p>
          <p className="text-[0.65rem] font-semibold text-stone-400">points</p>
        </div>
      </div>
      {record ? <p className="font-display text-sm font-bold text-yellow-200">🏆 New personal best!</p> : best ? <p className="text-xs font-semibold text-stone-400">Best run: {fmt(best.points)} points</p> : null}
      <button type="button" onClick={onNew} className={buttonStyles.primary}>
        <Play className="size-4" /> New run
      </button>
    </div>
  );
}
