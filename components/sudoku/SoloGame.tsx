"use client";

import { CalendarDays, Flag, Link2, Mountain, RotateCcw, Sparkles, Swords, Timer } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { afterPuzzle, newRun, tierOfRun, type AscentRun } from "@/lib/sudoku/ascent";
import { loadAscent, saveRun, useAscent } from "@/lib/sudoku/ascent-store";
import { formatDuration } from "@/lib/sudoku/client";
import { DIFFICULTIES, DIFFICULTY_CONFIG, isDifficulty, UNITS, type Difficulty } from "@/lib/sudoku/engine";
import {
  addTime,
  breakCombo,
  clearTrials,
  commitTrials,
  correctBoard,
  emptiesOf,
  enter,
  eraseCell,
  filledCount,
  freshGame,
  hintOpen,
  hintView,
  hintsLeft,
  isRanked,
  livesLeft,
  newGameState,
  requestHint,
  reveal,
  scoreOf,
  setTrial,
  toggleNote,
  trialCells,
  type EntryOutcome,
  type GameState,
  type InputMode,
} from "@/lib/sudoku/game";
import { isRevealedPuzzle, loadHistory, revealedBases, saveRecord, updateRecord, type HistoryRecord } from "@/lib/sudoku/history";
import { submitChallenge, type GameSubmission } from "@/lib/sudoku/leaderboard";
import { keepLog } from "@/lib/sudoku/logs";
import { loadPrefs, savePrefs, usePrefs } from "@/lib/sudoku/prefs";
import { awardSolve, type Award } from "@/lib/sudoku/profile";
import { dailyDifficulty, dailySeed, dayKey, starsForPar } from "@/lib/sudoku/progress";
import { generatePuzzle, puzzleFromBase } from "@/lib/sudoku/puzzles";
import { puzzleFromRecord } from "@/lib/sudoku/replay";
import { clearGame, loadGame, markDailyDone, saveGame } from "@/lib/sudoku/saves";
import { AWAY_EVENT, breakChain, CHAIN_BREAK_EVENT, recordClear, useChain, type ClearResult } from "@/lib/sudoku/session";
import { sfx } from "@/lib/sudoku/sfx";
import { recordSkill } from "@/lib/sudoku/skill";
import { recordSoloResult } from "@/lib/sudoku/stats";
import { analyseGame, type StrategyReport } from "@/lib/sudoku/strategy";
import type { ScoreBreakdown } from "@/lib/sudoku/scoring";
import type { ChallengeResult } from "@/lib/sudoku/types";
import { Board, type CellState } from "./Board";
import { LivesMeter, NumberPad, useBoardKeys } from "./Controls";
import { AscentLadder, ChallengeOutcomeView, GiveUpConfirm, HintPanel, PreGame, RunOver, ScoreView, StrategyView } from "./GamePanels";
import { ComboMeter, useJuice } from "./juice";
import { PostScorePanel } from "./PostScorePanel";
import { DIFFICULTY_STYLE } from "./theme";
import { VictoryCard } from "./Victory";
import { Walkthrough } from "./Walkthrough";
import { BackLink, buttonStyles, Toast, useIsClient, useToast } from "./ui";

export type SoloMode =
  | { kind: "classic"; difficulty: Difficulty }
  | { kind: "daily" }
  /** Increasing difficulty: one shared pool of lives, one tier up per clear. */
  | { kind: "ascent" }
  /** The same puzzle as a past game, unscored. */
  | { kind: "replay"; record: HistoryRecord }
  /** One scored attempt at a puzzle someone posted to the leaderboard. */
  | { kind: "challenge"; scoreId: string; baseId: string; seed: number; target: { score: number; playerName: string } };

export { loadDailyDone, loadSavedGame } from "@/lib/sudoku/saves";

function dailyGame(lives: number): GameState {
  const key = dayKey();
  return newGameState(generatePuzzle(dailyDifficulty(key), dailySeed(key)), { lives, kind: "daily", daily: key });
}

/** A saved game that can still be resumed: in progress, or a reveal whose walkthrough is open. */
function resumable(mode: SoloMode): GameState | null {
  const g =
    mode.kind === "classic"
      ? loadGame("classic", mode.difficulty)
      : mode.kind === "daily"
        ? loadGame("daily")
        : loadGame(mode.kind);
  if (!g || (g.status !== "playing" && g.status !== "revealed")) return null;
  if (mode.kind === "daily" && g.daily !== dayKey()) return null;
  if (mode.kind === "replay" && g.puzzle !== mode.record.puzzle) return null;
  if (mode.kind === "challenge" && (g.baseId !== mode.baseId || g.seed !== mode.seed)) return null;
  if (mode.kind === "ascent" && loadAscent().run?.status !== "active") return null;
  return g;
}

function challengeTier(baseId: string): Difficulty {
  const tier = baseId.split(":")[0];
  return isDifficulty(tier) ? tier : "medium";
}

/** The first game of a fresh Ascent run, or the next level of the current one. */
function ascentGame(run: AscentRun, exclude: ReadonlySet<string>): GameState {
  return freshGame(tierOfRun(run), run.remaining, exclude, undefined, { kind: "ascent", pool: { chosen: run.chosen } });
}

interface Result {
  score: ScoreBreakdown;
  chain: ClearResult | null;
  /** Null for replays, which earn no XP. */
  award: Award | null;
}

export function SoloGame({ mode }: { mode: SoloMode }) {
  // Puzzles and saves live in the browser, so render on the client only.
  const isClient = useIsClient();
  if (!isClient) return <div className="mx-auto aspect-square w-full max-w-[min(92vw,30rem)]" />;
  const key =
    mode.kind === "classic" ? mode.difficulty : mode.kind === "replay" ? `replay-${mode.record.id}` : mode.kind === "challenge" ? `challenge-${mode.scoreId}` : mode.kind;
  return <SoloGameInner key={key} mode={mode} />;
}

function SoloGameInner({ mode }: { mode: SoloMode }) {
  const kind = mode.kind;
  const router = useRouter();
  const [game, setGame] = useState<GameState | null>(() => resumable(mode));
  const [lives, setLives] = useState(() => {
    const preferred = loadPrefs().lives;
    return mode.kind === "ascent" && preferred === 0 ? 3 : preferred;
  });
  const [input, setInput] = useState<InputMode>("pen");
  const [selected, setSelected] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ index: number; key: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [report, setReport] = useState<StrategyReport | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  const [challengeOutcome, setChallengeOutcome] = useState<
    { kind: "sending" } | { kind: "done"; result: ChallengeResult } | { kind: "error"; message: string } | null
  >(null);
  const { toast, show } = useToast();
  const juice = useJuice((text) => show(text, "success"));
  const chain = useChain();
  const prefs = usePrefs();
  const ascent = useAscent();
  const run = kind === "ascent" ? (ascent?.run ?? null) : null;
  const today = dayKey();

  const difficulty: Difficulty =
    game?.difficulty ??
    (mode.kind === "daily"
      ? dailyDifficulty(today)
      : mode.kind === "classic"
        ? mode.difficulty
        : mode.kind === "replay"
          ? mode.record.difficulty
          : mode.kind === "challenge"
            ? challengeTier(mode.baseId)
            : run
              ? tierOfRun(run)
              : "beginner");
  const style = DIFFICULTY_STYLE[difficulty];

  // A daily puzzle that was given up on is locked for the rest of the day.
  const dailyLocked = useMemo(
    () => kind === "daily" && loadHistory().some((r) => r.result === "revealed" && r.daily === today),
    [kind, today],
  );

  // Restore the combo after a refresh (a refresh must not break it).
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !game) return;
    restored.current = true;
    if (game.combo > 0) juice.restoreCombo(game.combo, game.maxCombo);
  }, [game, juice]);

  // Persist on every change so a refresh resumes the same game.
  useEffect(() => {
    if (game) saveGame(game);
  }, [game]);

  // Timer: ticks while playing and the tab is visible.
  const playing = game?.status === "playing";
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") setGame((g) => (g ? addTime(g, 1000) : g));
    }, 1000);
    return () => clearInterval(id);
  }, [playing]);

  // Leaving the app ends the combo; the session chain is handled by the layout guard.
  useEffect(() => {
    const onAway = () => {
      setGame((g) => (g && g.combo > 0 ? breakCombo(g) : g));
      juice.breakCombo();
      show("Combo reset: you switched away", "error");
    };
    const onChainBreak = (e: Event) => {
      const d = (e as CustomEvent<{ reason: string; was: number }>).detail;
      show(`Clear chain of ${d.was} ended: ${d.reason}`, "error");
    };
    window.addEventListener(AWAY_EVENT, onAway);
    window.addEventListener(CHAIN_BREAK_EVENT, onChainBreak);
    return () => {
      window.removeEventListener(AWAY_EVENT, onAway);
      window.removeEventListener(CHAIN_BREAK_EVENT, onChainBreak);
    };
  }, [juice, show]);

  const hint = game && hintOpen(game) ? hintView(game) : null;

  const cells: CellState[] = useMemo(() => {
    if (!game) return [];
    const marks = new Map<number, NonNullable<CellState["mark"]>>();
    if (hint) {
      const h = hint.highlights;
      const digits = h.digits.reduce((m, d) => m | (1 << d), 0);
      for (const u of h.units) for (const c of UNITS[u]) marks.set(c, { ...marks.get(c), unit: true });
      for (const c of h.pattern) marks.set(c, { ...marks.get(c), pattern: true, focus: digits });
    }
    return game.values.map((value, i) => ({
      value,
      given: game.puzzle[i] !== "0",
      wrong: value !== 0 && String(value) !== game.solution[i],
      notes: game.notes[i],
      trial: value === 0 ? game.trial[i] : 0,
      mark: marks.get(i),
    }));
  }, [game, hint]);

  // ---- outcomes -----------------------------------------------------------

  /** Submits a finished challenge attempt; the server replays it and compares scores. */
  const sendChallenge = useCallback((g: GameState, scoreId: string) => {
    setChallengeOutcome({ kind: "sending" });
    const submission: GameSubmission = { baseId: g.baseId, seed: g.seed, lives: g.lives, log: g.log };
    submitChallenge(scoreId, submission)
      .then((result) => setChallengeOutcome({ kind: "done", result }))
      .catch((err: Error) => setChallengeOutcome({ kind: "error", message: err.message }));
  }, []);

  const finish = useCallback(
    (g: GameState, lastCell: number) => {
      const record = (extra: Partial<HistoryRecord>): HistoryRecord => ({
        id: g.id,
        at: Date.now(),
        kind: g.kind,
        difficulty: g.difficulty,
        rating: g.rating,
        seed: g.seed,
        puzzle: g.puzzle,
        baseId: g.baseId,
        daily: g.daily,
        level: g.kind === "ascent" ? DIFFICULTIES.indexOf(g.difficulty) + 1 : undefined,
        result: "won",
        elapsedMs: g.elapsedMs,
        parMs: g.parMs,
        lives: g.lives,
        livesLost: g.livesLost,
        hints: g.hintsUsed,
        maxCombo: g.maxCombo,
        score: 0,
        chain: null,
        ...extra,
      });

      if (g.status === "won") {
        const score = scoreOf(g);
        const cleared = isRanked(g) ? recordClear(score.total) : null;
        if (g.kind !== "replay") recordSoloResult(g.difficulty, true, g.elapsedMs);
        if (g.daily) markDailyDone(g.daily);
        // Replays of puzzles you've already played earn no XP.
        const award =
          g.kind === "replay"
            ? null
            : awardSolve({
                difficulty: g.difficulty,
                mistakes: g.livesLost,
                elapsedMs: g.elapsedMs,
                maxCombo: g.maxCombo,
                daily: !!g.daily,
                points: cleared?.awarded ?? 0,
                chainCount: cleared?.count ?? 0,
              });
        if (g.kind === "ascent") {
          const r = loadAscent().run;
          if (r) saveRun(afterPuzzle(r, { kind: "won", livesLost: g.livesLost, points: cleared?.awarded ?? 0 }));
        }
        setResult({ score, chain: cleared, award });
        saveRecord(record({ result: "won", score: score.total, chain: cleared }));
        if (g.kind === "classic" || g.kind === "daily") keepLog(g.id, g.log);
        if (g.kind === "challenge" && mode.kind === "challenge") sendChallenge(g, mode.scoreId);
        setSelected(null);
        setTimeout(() => juice.celebrate(lastCell), 350);
        setTimeout(() => setShowResult(true), 1900);
        // Strategy analysis can take a moment on the hardest puzzles; don't block the celebration.
        setTimeout(() => {
          const r = analyseGame({ puzzle: g.puzzle, solution: g.solution, log: g.log });
          setReport(r);
          recordSkill(r);
          updateRecord(g.id, {
            strategy: {
              hardest: r.hardestDemonstrated,
              techniques: r.techniques.map((t) => ({ technique: t.technique, evidence: t.evidence })),
              guesses: r.guesses,
              style: r.style,
            },
          });
        }, 600);
      } else if (g.status === "lost") {
        breakChain("lost");
        if (g.kind !== "replay") recordSoloResult(g.difficulty, false, g.elapsedMs);
        if (g.kind === "ascent") {
          const r = loadAscent().run;
          if (r) saveRun(afterPuzzle(r, { kind: "lost" }));
        }
        saveRecord(record({ result: "lost" }));
        sfx.lose();
        setTimeout(() => setShowResult(true), 700);
      }
    },
    [juice, mode, sendChallenge],
  );

  const handleOutcome = useCallback(
    (state: GameState, outcome: EntryOutcome) => {
      setGame(state);
      if (outcome.kind === "correct") {
        juice.correct(correctBoard(state), outcome.cell, outcome.combo);
        if (outcome.won) finish(state, outcome.cell);
      } else if (outcome.kind === "wrong") {
        setFlash({ index: outcome.cell, key: Date.now() });
        juice.wrong();
        const left = livesLeft(state);
        show(
          outcome.lost
            ? `${outcome.digit} is wrong. Out of lives!`
            : left === Infinity
              ? `Not ${outcome.digit}!`
              : `Not ${outcome.digit}! ${left} ${left === 1 ? "life" : "lives"} left`,
          "error",
        );
        if (outcome.lost) finish(state, outcome.cell);
      }
    },
    [finish, juice, show],
  );

  // ---- input --------------------------------------------------------------

  const enterDigit = useCallback(
    (n: number) => {
      if (!game || selected === null || game.status !== "playing") return;
      if (input === "notes") {
        sfx.tap();
        setGame(toggleNote(game, selected, n));
      } else if (input === "trial") {
        sfx.tap();
        setGame(setTrial(game, selected, n));
      } else {
        const r = enter(game, selected, n);
        handleOutcome(r.state, r.outcome);
      }
    },
    [game, selected, input, handleOutcome],
  );

  const erase = useCallback(() => {
    if (!game || selected === null) return;
    setGame(eraseCell(game, selected));
  }, [game, selected]);

  const commit = useCallback(
    (cellsToCommit?: number[]) => {
      if (!game || game.status !== "playing") return;
      const { state, outcomes } = commitTrials(game, cellsToCommit);
      if (!outcomes.length) return;
      setGame(state);
      let right = 0;
      let wrong = 0;
      for (const o of outcomes) {
        if (o.kind === "correct") {
          right++;
          juice.correct(correctBoard(state), o.cell, o.combo);
        } else if (o.kind === "wrong") {
          wrong++;
          setFlash({ index: o.cell, key: Date.now() });
        }
      }
      if (wrong) juice.wrong();
      show(
        wrong ? `${right} right, ${wrong} wrong: ${wrong} ${wrong === 1 ? "life" : "lives"} lost` : `All ${right} right!`,
        wrong ? "error" : "success",
      );
      const last = outcomes[outcomes.length - 1];
      if (state.status !== "playing" && last.kind !== "ignored") finish(state, last.cell);
    },
    [game, juice, show, finish],
  );

  const useHint = useCallback(() => {
    if (!game) return;
    const r = requestHint(game);
    if (!r.ok) {
      show(
        r.reason === "none-left"
          ? "No hints left in this game"
          : r.reason === "full"
            ? "You already have the full hint: work from the highlighted cells"
            : "No hint available",
        "info",
      );
      return;
    }
    setGame(r.state);
    juice.breakCombo();
    breakChain("hint");
    sfx.tap();
  }, [game, juice, show]);

  useBoardKeys({
    enabled: game?.status === "playing",
    selected,
    setSelected,
    onNumber: enterDigit,
    onErase: erase,
    mode: input,
    onMode: setInput,
    onHint: useHint,
    onCommit: () => commit(),
  });

  // ---- flow ---------------------------------------------------------------

  const resetView = useCallback(() => {
    setSelected(null);
    setResult(null);
    setReport(null);
    setShowResult(false);
    setConfirmGiveUp(false);
    setChallengeOutcome(null);
    setInput("pen");
    restored.current = true;
    juice.reset();
  }, [juice]);

  const start = useCallback(
    (chosen: number) => {
      savePrefs({ lives: chosen });
      resetView();
      if (mode.kind === "ascent") {
        const r = newRun(chosen);
        saveRun(r);
        setGame(ascentGame(r, revealedBases()));
      } else if (mode.kind === "replay") {
        const puzzle = puzzleFromRecord(mode.record);
        if (puzzle) setGame(newGameState(puzzle, { lives: chosen, kind: "replay" }));
      } else if (mode.kind === "challenge") {
        const puzzle = puzzleFromBase(mode.baseId, mode.seed);
        if (puzzle) setGame(newGameState(puzzle, { lives: chosen, kind: "challenge" }));
      } else if (mode.kind === "daily") {
        setGame(dailyGame(chosen));
      } else {
        setGame(freshGame(mode.difficulty, chosen, revealedBases()));
      }
    },
    [mode, resetView],
  );

  /** A brand-new puzzle at the same level and lives. The clear chain carries on. */
  const nextPuzzle = useCallback(() => {
    if (!game) return;
    if (game.kind === "replay") {
      router.push("/sudoku/history");
      return;
    }
    if (game.kind === "challenge" && mode.kind === "challenge") {
      router.push(`/sudoku/leaderboard/${mode.scoreId}`);
      return;
    }
    if (game.kind === "ascent") {
      const r = loadAscent().run;
      if (!r || r.status !== "active") return;
      resetView();
      clearGame("ascent");
      setGame(ascentGame(r, revealedBases()));
      return;
    }
    resetView();
    clearGame(game.kind, game.difficulty);
    setGame(freshGame(game.difficulty, game.lives, revealedBases()));
  }, [game, mode, resetView, router]);

  const retry = useCallback(() => {
    if (!game || isRevealedPuzzle(game.puzzle, game.daily)) return;
    resetView();
    const same = { puzzle: game.puzzle, solution: game.solution, difficulty: game.difficulty, seed: game.seed, rating: game.rating, parMs: game.parMs, baseId: game.baseId };
    setGame(newGameState(same, { lives: game.lives, kind: game.kind, daily: game.daily, pool: game.pool }));
  }, [game, resetView]);

  const giveUp = useCallback(() => {
    if (!game) return;
    const g = reveal(game);
    setGame(g);
    setConfirmGiveUp(false);
    setShowResult(false);
    juice.reset();
    if (g.kind !== "replay") recordSoloResult(g.difficulty, false, g.elapsedMs);
    if (g.kind === "ascent") {
      const r = loadAscent().run;
      if (r) saveRun(afterPuzzle(r, { kind: "revealed", livesLost: g.livesLost }));
    }
    saveRecord({
      id: g.id,
      at: Date.now(),
      kind: g.kind,
      difficulty: g.difficulty,
      rating: g.rating,
      seed: g.seed,
      puzzle: g.puzzle,
      baseId: g.baseId,
      daily: g.daily,
      level: g.kind === "ascent" ? DIFFICULTIES.indexOf(g.difficulty) + 1 : undefined,
      result: "revealed",
      elapsedMs: g.elapsedMs,
      parMs: g.parMs,
      lives: g.lives,
      livesLost: g.livesLost,
      hints: g.hintsUsed,
      maxCombo: g.maxCombo,
      score: 0,
      chain: null,
    });
  }, [game, juice]);

  /** Ascent: abandon the finished run and return to the lives picker. */
  const startOver = useCallback(() => {
    clearGame("ascent");
    saveRun(null);
    resetView();
    setGame(null);
  }, [resetView]);

  // ---- render -------------------------------------------------------------

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <BackLink
        href={kind === "replay" ? "/sudoku/history" : mode.kind === "challenge" ? `/sudoku/leaderboard/${mode.scoreId}` : "/sudoku"}
      />
      {kind === "ascent" ? (
        <AscentLadder run={run} current={difficulty} />
      ) : mode.kind === "challenge" ? (
        <span className="flex max-w-full items-center gap-2 truncate rounded-full border border-yellow-300/40 bg-yellow-300/10 px-3 py-1.5 font-display text-sm font-semibold text-yellow-200">
          <Swords className="size-4 shrink-0" /> Beat {mode.target.playerName}: {mode.target.score.toLocaleString("en-US")}
        </span>
      ) : kind === "replay" ? (
        <span className="flex items-center gap-2 rounded-full border border-violet-300/40 bg-violet-400/10 px-3 py-1.5 font-display text-sm font-semibold text-violet-200">
          <RotateCcw className="size-4" /> Replay · <span className={style.text}>{DIFFICULTY_CONFIG[difficulty].label}</span> · unscored
        </span>
      ) : kind === "daily" ? (
        <span className="flex items-center gap-2 rounded-full border border-pink-300/40 bg-pink-400/10 px-3 py-1.5 font-display text-sm font-semibold text-pink-200">
          <CalendarDays className="size-4" /> Daily · <span className={style.text}>{DIFFICULTY_CONFIG[difficulty].label}</span>
        </span>
      ) : (
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-full border border-white/10 bg-white/[0.03] p-1 text-xs [scrollbar-width:none]">
          {DIFFICULTIES.map((d) => (
            <Link
              key={d}
              href={`/sudoku/play/${d}`}
              aria-current={d === difficulty ? "page" : undefined}
              ref={d === difficulty ? (el) => el?.scrollIntoView({ inline: "center", block: "nearest" }) : undefined}
              className={`shrink-0 rounded-full px-3 py-1 font-display font-semibold transition ${d === difficulty ? DIFFICULTY_STYLE[d].chip : "text-stone-400 hover:text-stone-100"}`}
            >
              {DIFFICULTY_CONFIG[d].label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );

  if (dailyLocked) {
    return (
      <div className="space-y-4">
        {header}
        <div className="mx-auto w-full max-w-[min(92vw,30rem)] space-y-3 rounded-3xl border border-rose-300/30 bg-rose-400/[0.07] p-5 text-center">
          <p className="font-display text-xl font-bold text-rose-200">Today&apos;s daily is locked</p>
          <p className="text-sm font-semibold text-stone-300">
            You revealed the solution, so this puzzle can&apos;t be played again. A new daily arrives tomorrow.
          </p>
          <Link href="/sudoku" className={buttonStyles.primary}>
            Back to hub
          </Link>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="space-y-4">
        {header}
        {kind === "ascent" && run?.status === "over" ? (
          <div className="flex justify-center">
            <RunOver run={run} best={ascent?.best ?? null} onNew={() => saveRun(null)} />
          </div>
        ) : kind === "ascent" ? (
          <PreGame
            difficulty="master"
            lives={lives}
            onLives={setLives}
            onStart={() => start(lives)}
            kicker="Increasing difficulty"
            heading="Ascent"
            blurb="Climb from Beginner to Master. Each clear moves you up a tier."
            needs="One pool of lives for the whole run, no refills. Run out and the climb ends."
            note="Show Solution keeps the run alive at the same level. Fewer lives chosen still pays more."
            question="Lives for the whole run"
            startLabel="Begin the climb"
            noUnlimited
          />
        ) : mode.kind === "challenge" ? (
          <PreGame
            difficulty={difficulty}
            lives={lives === 0 ? 3 : lives}
            onLives={setLives}
            onStart={() => start(lives === 0 ? 3 : lives)}
            kicker="Challenge"
            heading={`Beat ${mode.target.playerName}`}
            blurb={`Their score on this exact puzzle is ${mode.target.score.toLocaleString("en-US")}.`}
            needs="One scored attempt: leaving now still uses it up."
            note="Choose your lives. Fewer lives pay more, so it's part of the challenge. Hints cost points."
            question="Your lives"
            startLabel="Start the challenge"
            noUnlimited
          />
        ) : kind === "replay" ? (
          <PreGame
            difficulty={difficulty}
            lives={lives}
            onLives={setLives}
            onStart={() => start(lives)}
            kicker="Replay"
            note="You've seen this puzzle, so a replay earns no points, XP or chain. It's for practice and fun."
            startLabel="Play it again"
          />
        ) : (
          <PreGame difficulty={difficulty} daily={kind === "daily"} lives={lives} onLives={setLives} onStart={() => start(lives)} />
        )}
        <Toast toast={toast} />
      </div>
    );
  }

  if (game.status === "revealed") {
    return (
      <div className="space-y-4">
        {header}
        <Walkthrough
          puzzle={game.puzzle}
          board={correctBoard(game)}
          nextLabel={kind === "daily" ? "Back to hub" : mode.kind === "challenge" ? "Back to the score" : kind === "replay" ? "Back to history" : "Next puzzle"}
          onNext={() => {
            if (kind === "daily") router.push("/sudoku");
            else nextPuzzle();
          }}
        />
      </div>
    );
  }

  const filled = filledCount(game);
  const toFill = emptiesOf(game);
  const trialCount = trialCells(game).length;
  const giveUpPanel = <GiveUpConfirm chain={chain?.count ?? 0} onConfirm={giveUp} onCancel={() => setConfirmGiveUp(false)} />;

  let overlay: React.ReactNode = null;
  if (game.status === "won" && showResult && result) {
    overlay = (
      <VictoryCard
        title={kind === "daily" ? "Daily cleared!" : "Solved!"}
        subtitle={`${DIFFICULTY_CONFIG[difficulty].label} · rating ${game.rating.toFixed(1)} · ${formatDuration(game.elapsedMs)} · ${game.livesLost} ${game.livesLost === 1 ? "life" : "lives"} lost${game.hintsUsed ? ` · ${game.hintsUsed} ${game.hintsUsed === 1 ? "hint" : "hints"}` : ""}`}
        stars={starsForPar(game.parMs, game.livesLost, game.hintsUsed, game.elapsedMs)}
        award={result.award}
        extra={
          <>
            <ScoreView score={result.score} chain={result.chain} />
            {mode.kind === "challenge" ? <ChallengeOutcomeView outcome={challengeOutcome} /> : null}
            {(kind === "classic" || kind === "daily") && isRanked(game) ? (
              <PostScorePanel
                recordId={game.id}
                submission={{ baseId: game.baseId, seed: game.seed, lives: game.lives, log: game.log, daily: game.daily }}
              />
            ) : null}
            <StrategyView report={report} />
          </>
        }
      >
        {kind === "daily" ? (
          <Link href="/sudoku" className={buttonStyles.primary}>
            Back to hub
          </Link>
        ) : kind === "replay" ? (
          <Link href="/sudoku/history" className={buttonStyles.primary}>
            Back to history
          </Link>
        ) : mode.kind === "challenge" ? (
          <Link href={`/sudoku/leaderboard/${mode.scoreId}`} className={buttonStyles.primary}>
            Back to the score
          </Link>
        ) : (
          <button type="button" onClick={nextPuzzle} className={buttonStyles.primary}>
            <Sparkles className="size-4" />
            {kind === "ascent" && run ? ` Level up: ${DIFFICULTY_CONFIG[tierOfRun(run)].label}` : " Next puzzle"}
          </button>
        )}
      </VictoryCard>
    );
  } else if (game.status === "lost" && showResult && mode.kind === "challenge") {
    overlay = confirmGiveUp ? (
      giveUpPanel
    ) : (
      <div className="space-y-3 px-6 text-center">
        <p className="text-5xl">⚔️</p>
        <h2 className="font-display text-3xl font-bold text-rose-300">Challenge failed</h2>
        <p className="text-sm font-semibold text-stone-300">
          You ran out of lives, and that was your one scored attempt. {mode.target.playerName}&apos;s {mode.target.score.toLocaleString("en-US")} stands.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href={`/sudoku/leaderboard/${mode.scoreId}`} className={buttonStyles.primary}>
            Back to the score
          </Link>
          <button type="button" onClick={() => setConfirmGiveUp(true)} className={buttonStyles.secondary}>
            Show solution
          </button>
        </div>
      </div>
    );
  } else if (game.status === "lost" && showResult && kind === "ascent") {
    overlay = run ? <RunOver run={run} best={ascent?.best ?? null} onNew={startOver} /> : null;
  } else if (game.status === "lost" && showResult) {
    overlay = confirmGiveUp ? (
      giveUpPanel
    ) : (
      <div className="space-y-4 px-6 text-center">
        <p className="text-5xl">💔</p>
        <h2 className="font-display text-4xl font-bold text-rose-300">Out of lives</h2>
        <p className="text-sm font-semibold text-stone-300">
          {filled}/{toFill} cells solved. So close. Go again?
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={retry} className={buttonStyles.primary}>
            <RotateCcw className="size-4" /> Retry
          </button>
          {kind === "classic" ? (
            <button type="button" onClick={nextPuzzle} className={buttonStyles.secondary}>
              New puzzle
            </button>
          ) : null}
          <button type="button" onClick={() => setConfirmGiveUp(true)} className={buttonStyles.secondary}>
            Show solution
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}

      <div className="mx-auto grid w-full max-w-[min(92vw,30rem)] grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
        <LivesMeter
          lives={game.pool?.chosen ?? game.lives}
          lost={game.pool ? game.pool.chosen - game.lives + game.livesLost : game.livesLost}
        />
        <div className="flex justify-center">
          <ComboMeter combo={juice.combo} />
        </div>
        <div className="flex items-center justify-end gap-3 font-num font-semibold tabular-nums">
          <span className="text-stone-400">
            {filled}/{toFill}
          </span>
          {prefs.showTimer ? (
            <span className="flex items-center gap-1 text-stone-100">
              <Timer className="size-4 text-cyan-300" /> {formatDuration(game.elapsedMs)}
            </span>
          ) : null}
        </div>
      </div>

      {kind === "ascent" && run ? (
        <p className="mx-auto flex w-full max-w-[min(92vw,30rem)] items-center justify-between rounded-full border border-violet-300/20 bg-violet-300/[0.06] px-3 py-1 text-xs font-bold text-violet-200">
          <span className="flex items-center gap-1">
            <Mountain className="size-3.5" /> Level {Math.min(run.level + 1, 6)} · {run.cleared} cleared
          </span>
          <span className="font-num">Run {run.points.toLocaleString("en-US")} pts</span>
        </p>
      ) : null}

      {chain && (chain.count > 0 || chain.points > 0) ? (
        <p className="mx-auto flex w-full max-w-[min(92vw,30rem)] items-center justify-between rounded-full border border-yellow-300/20 bg-yellow-300/[0.06] px-3 py-1 text-xs font-bold text-yellow-200">
          <span className="flex items-center gap-1">
            <Link2 className="size-3.5" /> Clear chain {chain.count}
          </span>
          <span className="font-num">Session {chain.points.toLocaleString("en-US")} pts</span>
        </p>
      ) : null}

      <div className="mx-auto h-1.5 w-full max-w-[min(92vw,30rem)] overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-pink-400 shadow-[0_0_12px_rgb(34_211_238/0.7)] transition-all duration-500"
          style={{ width: `${toFill ? (filled / toFill) * 100 : 0}%` }}
        />
      </div>

      <Board cells={cells} selected={selected} onSelect={setSelected} flash={flash} effects={juice.effects} overlay={overlay} />

      {hint ? <HintPanel view={hint} left={hintsLeft(game)} /> : null}

      <NumberPad
        cells={cells}
        mode={input}
        onMode={setInput}
        disabled={game.status !== "playing"}
        onNumber={enterDigit}
        onErase={erase}
        hint={{ left: hintsLeft(game), onUse: useHint }}
        trial={{
          count: trialCount,
          onCommit: () => commit(),
          onClear: () => setGame((g) => (g ? clearTrials(g) : g)),
        }}
      />

      {game.status === "playing" ? (
        confirmGiveUp ? (
          giveUpPanel
        ) : (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setConfirmGiveUp(true)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-stone-500 transition hover:text-rose-300"
            >
              <Flag className="size-3.5" /> Give up & show solution
            </button>
          </div>
        )
      ) : null}

      <Toast toast={toast} />
    </div>
  );
}
