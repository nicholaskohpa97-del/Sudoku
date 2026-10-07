// Strategy detection: infers which Sudoku techniques a player used from the
// moves they made. This is inference, not mind-reading, so every conclusion
// carries a confidence level:
//
//   demonstrated  a pencil-mark removal (or a note-backed placement) that only
//                 this technique, or a harder one, can justify.
//   likely        the placement needed the technique, and the player paused
//                 (or noted the cell) before making it.
//   possible      the placement needed the technique but came quickly with no
//                 notes: intuition, pattern recognition, or a lucky guess.
//
// Wrong entries and placements that no known technique justifies count as guesses.
import type { MoveEvent } from "./game";
import { cloneState, applyStep, hasCand, nextStep, popcount, ratePuzzle, stateFromGrid, TECHNIQUES, type State } from "./solver";
import type { Step, TechniqueId } from "./solver";
import { UNITS, unitsOfCell } from "./solver/grid";
import { bit } from "./engine";

export type Evidence = "demonstrated" | "likely" | "possible";
const RANK: Record<Evidence, number> = { demonstrated: 3, likely: 2, possible: 1 };

export interface TechniqueEvidence {
  technique: TechniqueId;
  evidence: Evidence;
  /** Moves attributed to it. */
  count: number;
}

export type ScanStyle = "digit-by-digit" | "cell-by-cell" | "mixed" | "too-short";

export interface StrategyReport {
  /** Techniques beyond plain singles that the moves point to, hardest first. */
  techniques: TechniqueEvidence[];
  /** Singles only: how many placements were hidden / naked singles. */
  singles: { hidden: number; naked: number };
  hardestDemonstrated: TechniqueId | null;
  /** Wrong entries plus placements no technique here explains. */
  guesses: number;
  wrongEntries: number;
  /** Placements committed from pencil trial, and how many of those were right. */
  trial: { placed: number; correct: number };
  style: ScanStyle;
  /** What the puzzle itself forced, and whether the player's moves back it. */
  forced: { technique: TechniqueId; evidence: Evidence | "not-seen" }[];
  /** True if the time budget ran out before every move was analysed. */
  partial: boolean;
  /** Plain-language takeaways. */
  summary: string[];
}

interface Placement {
  event: MoveEvent;
  need: number;
  technique: TechniqueId;
}

const SINGLE_TECHNIQUES: TechniqueId[] = ["full-house", "hidden-single", "naked-single"];
const isAdvanced = (id: TechniqueId) => TECHNIQUES[id].weight >= 2.6;

/** Hidden/naked single check for a specific placement, else the cheapest-first run that reaches it. */
function needFor(s: State, cell: number, digit: number, deadline: number): { need: number; technique: TechniqueId } | null {
  if (popcount(s.cand[cell]) === 1) return { need: 2.3, technique: "naked-single" };
  for (const u of unitsOfCell(cell)) {
    let spots = 0;
    for (const i of UNITS[u]) if (s.cand[i] & bit(digit)) spots++;
    if (spots === 1) return { need: u >= 18 ? 1.2 : 1.5, technique: "hidden-single" };
  }
  const t = cloneState(s);
  let hardest: Step | null = null;
  for (let i = 0; i < 150; i++) {
    if (performance.now() > deadline) return null;
    const step = nextStep(t);
    if (!step) return null;
    if (!hardest || step.weight > hardest.weight) hardest = step;
    applyStep(t, step);
    if (t.cells[cell] !== 0) return { need: hardest.weight, technique: hardest.technique };
  }
  return null;
}

/** Which advanced technique justifies removing candidate `digit` from `cell`, from this state. */
function justifyElimination(s: State, cell: number, digit: number, deadline: number): TechniqueId | null {
  const t = cloneState(s);
  for (let i = 0; i < 60; i++) {
    if (performance.now() > deadline) return null;
    const step = nextStep(t, { maxWeight: 6.9 });
    if (!step) return null;
    if (step.eliminations.some((e) => e.cell === cell && e.digit === digit)) return step.technique;
    applyStep(t, step);
    if (!hasCand(t, cell, digit)) return step.technique; // vanished through a placement
  }
  return null;
}

export function analyseGame(input: {
  puzzle: string;
  solution: string;
  log: MoveEvent[];
  /** Milliseconds allowed for the solver work. */
  budgetMs?: number;
}): StrategyReport {
  const { puzzle, solution, log } = input;
  const deadline = performance.now() + (input.budgetMs ?? 2500);
  const board = Array.from(puzzle, Number);
  let state = stateFromGrid(puzzle);
  const noteOn = new Set<number>(); // cell * 10 + digit
  const notedCell = new Set<number>();
  let partial = false;

  const placements: Placement[] = [];
  const manual: { technique: TechniqueId; at: number }[] = [];
  const evidence = new Map<TechniqueId, { best: Evidence; count: number }>();
  const bump = (id: TechniqueId, e: Evidence) => {
    const cur = evidence.get(id);
    if (!cur) evidence.set(id, { best: e, count: 1 });
    else evidence.set(id, { best: RANK[e] > RANK[cur.best] ? e : cur.best, count: cur.count + 1 });
  };

  const gaps: number[] = [];
  for (let i = 1; i < log.length; i++) gaps.push(log[i].t - log[i - 1].t);
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const medianGap = sortedGaps.length ? sortedGaps[Math.floor(sortedGaps.length / 2)] : 5000;

  let singlesHidden = 0;
  let singlesNaked = 0;
  let wrongEntries = 0;
  let unexplained = 0;
  const trial = { placed: 0, correct: 0 };

  log.forEach((ev, idx) => {
    if (ev.x) {
      trial.placed++;
      if (ev.k === "place") trial.correct++;
    }
    if (ev.k === "wrong") {
      wrongEntries++;
      return;
    }
    if (ev.k === "note") {
      const key = ev.c * 10 + ev.d;
      if (noteOn.has(key)) {
        noteOn.delete(key);
        // A removal of a real candidate that no placement forced is a deliberate elimination.
        if (hasCand(state, ev.c, ev.d) && !partial) {
          const id = justifyElimination(state, ev.c, ev.d, deadline);
          if (id && isAdvanced(id)) {
            manual.push({ technique: id, at: idx });
            bump(id, "demonstrated");
          } else if (performance.now() > deadline) partial = true;
        }
      } else {
        noteOn.add(key);
        notedCell.add(ev.c);
      }
      return;
    }
    if (ev.k !== "place") return;

    board[ev.c] = ev.d;
    const prevState = state;
    state = stateFromGrid(board.map((v) => v).join(""));
    if (partial) return;
    const found = needFor(prevState, ev.c, ev.d, deadline);
    if (!found) {
      if (performance.now() > deadline) partial = true;
      else unexplained++;
      return;
    }
    placements.push({ event: ev, need: found.need, technique: found.technique });
    if (found.technique === "hidden-single" || found.technique === "full-house") singlesHidden++;
    else if (found.technique === "naked-single") singlesNaked++;
    else {
      const paused = idx > 0 && ev.t - log[idx - 1].t > Math.max(8000, medianGap * 2.5);
      const noted = notedCell.has(ev.c);
      const backed = manual.some((m) => idx - m.at <= 40 && TECHNIQUES[m.technique].weight >= found.need - 0.3);
      bump(found.technique, backed ? "demonstrated" : paused || noted ? "likely" : "possible");
    }
  });

  // How the player scans: same digit again (cross-hatching) or neighbouring cells.
  const correct = log.filter((e) => e.k === "place");
  let sameDigit = 0;
  let sameUnit = 0;
  for (let i = 1; i < correct.length; i++) {
    if (correct[i].d === correct[i - 1].d) sameDigit++;
    else if (unitsOfCell(correct[i].c).some((u) => unitsOfCell(correct[i - 1].c).includes(u))) sameUnit++;
  }
  const pairs = Math.max(1, correct.length - 1);
  const style: ScanStyle =
    correct.length < 12 ? "too-short" : sameDigit / pairs > 0.3 ? "digit-by-digit" : sameUnit / pairs > 0.4 ? "cell-by-cell" : "mixed";

  const techniques: TechniqueEvidence[] = [...evidence]
    .map(([technique, v]) => ({ technique, evidence: v.best, count: v.count }))
    .sort((a, b) => TECHNIQUES[b.technique].weight - TECHNIQUES[a.technique].weight);
  const hardest = techniques.find((t) => t.evidence === "demonstrated")?.technique ?? null;

  // What the puzzle forced itself.
  const rating = ratePuzzle(puzzle);
  const forced = rating
    ? (Object.keys(rating.counts) as TechniqueId[])
        .filter((id) => !SINGLE_TECHNIQUES.includes(id))
        .sort((a, b) => TECHNIQUES[b].weight - TECHNIQUES[a].weight)
        .map((technique) => ({
          technique,
          evidence: (evidence.get(technique)?.best ?? "not-seen") as Evidence | "not-seen",
        }))
    : [];

  const guesses = wrongEntries + unexplained;
  const report: StrategyReport = {
    techniques,
    singles: { hidden: singlesHidden, naked: singlesNaked },
    hardestDemonstrated: hardest,
    guesses,
    wrongEntries,
    trial,
    style,
    forced,
    partial,
    summary: [],
  };
  report.summary = summarise(report);
  void solution;
  return report;
}

const EVIDENCE_WORD: Record<Evidence, string> = {
  demonstrated: "clearly used",
  likely: "probably used",
  possible: "may have used",
};

function summarise(r: StrategyReport): string[] {
  const out: string[] = [];
  const total = r.singles.hidden + r.singles.naked;
  if (total) {
    out.push(
      `Singles did most of the work: ${r.singles.hidden} hidden and ${r.singles.naked} naked.`,
    );
  }
  for (const t of r.techniques.slice(0, 4)) {
    out.push(`You ${EVIDENCE_WORD[t.evidence]} ${TECHNIQUES[t.technique].name}${t.count > 1 ? ` (${t.count}×)` : ""}.`);
  }
  const missed = r.forced.filter((f) => f.evidence === "not-seen");
  if (missed.length) {
    out.push(
      `This puzzle forced ${missed.map((m) => TECHNIQUES[m.technique].name).join(", ")}, but your moves don't show it: you probably got past by a guess or a different route.`,
    );
  }
  if (r.guesses) out.push(`${r.guesses} ${r.guesses === 1 ? "move was" : "moves were"} guesses or couldn't be explained by any technique.`);
  if (r.trial.placed) out.push(`Pencil trial: ${r.trial.correct} of ${r.trial.placed} committed digits were right.`);
  if (r.style === "digit-by-digit") out.push("Your style: digit by digit, sweeping the grid for one number at a time.");
  else if (r.style === "cell-by-cell") out.push("Your style: cell by cell, working through the candidates of neighbouring squares.");
  if (r.partial) out.push("The analysis hit its time limit, so the later moves weren't examined.");
  return out;
}

// ---------------------------------------------------------------------------
// Skill profile across games

export type SkillProfile = Partial<Record<TechniqueId, { demonstrated: number; likely: number; possible: number }>>;

export function addToProfile(profile: SkillProfile, report: StrategyReport): SkillProfile {
  const out: SkillProfile = { ...profile };
  for (const t of report.techniques) {
    const cur = out[t.technique] ?? { demonstrated: 0, likely: 0, possible: 0 };
    out[t.technique] = { ...cur, [t.evidence]: cur[t.evidence] + 1 };
  }
  return out;
}

/** The easiest technique the player hasn't yet shown, as a "learn this next" suggestion. */
export function nextToLearn(profile: SkillProfile, from: TechniqueId[] = ORDER): TechniqueId | null {
  for (const id of from) {
    const p = profile[id];
    if (!p || p.demonstrated + p.likely === 0) return id;
  }
  return null;
}

const ORDER: TechniqueId[] = [
  "pointing",
  "claiming",
  "naked-pair",
  "hidden-pair",
  "x-wing",
  "naked-triple",
  "swordfish",
  "xy-wing",
  "skyscraper",
  "two-string-kite",
  "w-wing",
  "xyz-wing",
  "simple-coloring",
  "x-chain",
  "xy-chain",
  "aic",
];
