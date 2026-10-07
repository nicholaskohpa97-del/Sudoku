// Leaderboard rules: posting verified scores, challenging them, who holds the
// throne, and who gets told when they lose it. Pure functions over `Db`, like
// rooms.ts, so every rule is unit-tested without a server.
import { dailyDifficulty, dailySeed, dayKey } from "@/lib/sudoku/progress";
import { generatePuzzle, puzzleFromBase } from "@/lib/sudoku/puzzles";
import { DIFFICULTIES, DIFFICULTY_CONFIG, isDifficulty, type Difficulty } from "@/lib/sudoku/engine";
import { verifyGame, type VerifiedGame } from "@/lib/sudoku/verify";
import type {
  BoardKind,
  ChallengeResult,
  NotificationView,
  PlayerBoardRow,
  PostResult,
  ScoreDetail,
  ScoreEntryView,
} from "@/lib/sudoku/types";
import { HttpError } from "./errors";
import { newId } from "./http";
import type { AttemptRecord, Db, NotificationRecord, PlayerRecord, ScoreRecord } from "./store";

export const MAX_SCORES = 4000;
export const MAX_NOTIFICATIONS = 100;
const POST_COOLDOWN_MS = 4000;
const WEEK_MS = 7 * 86_400_000;

// Reads never touch the (possibly cached) document; writes create the arrays on demand.
const NONE: never[] = [];
const scoresOf = (db: Db): ScoreRecord[] => db.scores ?? NONE;
const attemptsOf = (db: Db): AttemptRecord[] => db.attempts ?? NONE;
const notificationsOf = (db: Db): NotificationRecord[] => db.notifications ?? NONE;

/** Best first; ties go to whoever got there first. */
const byBest = (a: ScoreRecord, b: ScoreRecord) => b.score - a.score || a.at - b.at;
const visible = (s: ScoreRecord) => !s.flagged;

const nameOf = (db: Db, id: string) => db.players[id]?.name ?? "Someone";

export function toView(db: Db, s: ScoreRecord, rank: number, viewerId?: string): ScoreEntryView {
  return {
    id: s.id,
    rank,
    playerId: s.playerId,
    playerName: nameOf(db, s.playerId),
    difficulty: s.difficulty,
    rating: s.rating,
    score: s.score,
    elapsedMs: s.elapsedMs,
    parMs: s.parMs,
    lives: s.lives,
    livesLost: s.livesLost,
    hints: s.hints,
    maxCombo: s.maxCombo,
    at: s.at,
    source: s.source,
    daily: s.daily,
    baseId: s.baseId,
    seed: s.seed,
    mine: s.playerId === viewerId,
    ...(s.flagged && s.playerId === viewerId ? { flagged: true } : {}),
  };
}

// ---------------------------------------------------------------------------
// Thrones

/** Everyone's visible results on one exact puzzle, best first. */
export function puzzleLadder(db: Db, puzzle: string): ScoreRecord[] {
  return scoresOf(db).filter((s) => s.puzzle === puzzle && visible(s)).sort(byBest);
}

/** Visible results at a level, best first: the all-time board. */
function tierBoard(db: Db, tier: Difficulty): ScoreRecord[] {
  return scoresOf(db).filter((s) => s.difficulty === tier && visible(s)).sort(byBest);
}

const rankIn = (list: ScoreRecord[], id: string): number | null => {
  const i = list.findIndex((s) => s.id === id);
  return i < 0 ? null : i + 1;
};

function notify(db: Db, n: Omit<NotificationRecord, "id" | "at" | "read">, now: number): void {
  const all = (db.notifications ??= []);
  all.push({ ...n, id: newId(), at: now, read: false });
  const mine = all.filter((x) => x.playerId === n.playerId);
  if (mine.length > MAX_NOTIFICATIONS) {
    const drop = new Set(mine.slice(0, mine.length - MAX_NOTIFICATIONS).map((x) => x.id));
    db.notifications = all.filter((x) => !drop.has(x.id));
  }
}

const fmt = (n: number) => n.toLocaleString("en-US");

/** Tells whoever just lost a throne or had their score beaten. Returns how many people were told. */
function announce(
  db: Db,
  inserted: ScoreRecord,
  before: { puzzleTop: ScoreRecord | undefined; tierTop: ScoreRecord | undefined },
  challenged: ScoreRecord | undefined,
  now: number,
): number {
  if (inserted.flagged) return 0;
  const by = nameOf(db, inserted.playerId);
  const level = DIFFICULTY_CONFIG[inserted.difficulty].label;
  const told = new Set<string>();
  const tell = (playerId: string, n: Omit<NotificationRecord, "id" | "at" | "read" | "playerId">) => {
    if (playerId === inserted.playerId) return;
    // One message per person per event about this puzzle; the board message is separate news.
    const scope = n.kind === "dethroned-board" ? "board" : "puzzle";
    const key = `${playerId}:${scope}`;
    if (told.has(key)) return;
    told.add(key);
    notify(db, { playerId, ...n }, now);
  };

  const ladderTop = puzzleLadder(db, inserted.puzzle)[0];
  if (ladderTop?.id === inserted.id && before.puzzleTop && before.puzzleTop.playerId !== inserted.playerId) {
    tell(before.puzzleTop.playerId, {
      kind: "dethroned",
      title: `👑 ${by} took your throne`,
      body: `${by} scored ${fmt(inserted.score)} on your ${level} puzzle, beating your ${fmt(before.puzzleTop.score)}. Take it back!`,
      href: `/sudoku/leaderboard/${inserted.id}`,
    });
  }
  const boardTop = tierBoard(db, inserted.difficulty)[0];
  if (boardTop?.id === inserted.id && before.tierTop && before.tierTop.playerId !== inserted.playerId) {
    tell(before.tierTop.playerId, {
      kind: "dethroned-board",
      title: `👑 You lost #1 on the ${level} board`,
      body: `${by} now leads the all-time ${level} board with ${fmt(inserted.score)}, ahead of your ${fmt(before.tierTop.score)}.`,
      href: `/sudoku/leaderboard`,
    });
  }
  if (challenged && inserted.score > challenged.score && challenged.playerId !== inserted.playerId) {
    // The challenged player may already have been told they lost the puzzle's throne.
    tell(challenged.playerId, {
      kind: "beaten",
      title: `⚔️ ${by} beat your score`,
      body: `${by} took on your ${level} puzzle and scored ${fmt(inserted.score)} against your ${fmt(challenged.score)}.`,
      href: `/sudoku/leaderboard/${inserted.id}`,
    });
  }
  return told.size;
}

// ---------------------------------------------------------------------------
// Posting

export interface GameInput {
  baseId?: unknown;
  seed?: unknown;
  log?: unknown;
  lives?: unknown;
  daily?: unknown;
}

function verified(input: GameInput): VerifiedGame {
  const r = verifyGame({ baseId: input.baseId, seed: input.seed, log: input.log, lives: input.lives });
  if (!r.ok) throw new HttpError(422, r.reason);
  return r.game;
}

function newScore(player: PlayerRecord, g: VerifiedGame, source: ScoreRecord["source"], now: number, extra: Partial<ScoreRecord> = {}): ScoreRecord {
  return {
    id: newId(),
    playerId: player.id,
    baseId: g.baseId,
    seed: g.seed,
    puzzle: g.puzzle,
    difficulty: g.difficulty,
    rating: g.rating,
    parMs: g.parMs,
    score: g.score.total,
    elapsedMs: g.elapsedMs,
    lives: g.lives,
    livesLost: g.livesLost,
    hints: g.hints,
    maxCombo: g.maxCombo,
    at: now,
    source,
    flagged: g.flagged,
    ...extra,
  };
}

/** The daily puzzle's identity for a day key. */
function dailyId(key: string) {
  const p = generatePuzzle(dailyDifficulty(key), dailySeed(key));
  return { baseId: p.baseId, seed: p.seed };
}

/** Trims the oldest results once the board is too big, never touching a puzzle's champion. */
function trim(db: Db): void {
  const all = scoresOf(db);
  if (all.length <= MAX_SCORES) return;
  const champions = new Set<string>();
  const seen = new Set<string>();
  for (const s of [...all].sort(byBest)) {
    if (!seen.has(s.puzzle)) {
      seen.add(s.puzzle);
      champions.add(s.id);
    }
  }
  const droppable = all.filter((s) => !champions.has(s.id)).sort((a, b) => a.at - b.at);
  const drop = new Set(droppable.slice(0, all.length - MAX_SCORES).map((s) => s.id));
  db.scores = all.filter((s) => !drop.has(s.id));
}

function insert(db: Db, s: ScoreRecord, challenged: ScoreRecord | undefined, now: number): { puzzleRank: number | null; boardRank: number | null } {
  const before = { puzzleTop: puzzleLadder(db, s.puzzle)[0], tierTop: tierBoard(db, s.difficulty)[0] };
  (db.scores ??= []).push(s);
  announce(db, s, before, challenged, now);
  trim(db);
  return { puzzleRank: s.flagged ? null : rankIn(puzzleLadder(db, s.puzzle), s.id), boardRank: s.flagged ? null : rankIn(tierBoard(db, s.difficulty), s.id) };
}

/** Posts a finished game. The server replays the move log and computes the score itself. */
export function postScore(db: Db, player: PlayerRecord, input: GameInput, now = Date.now()): PostResult {
  const recent = scoresOf(db).some((s) => s.playerId === player.id && now - s.at < POST_COOLDOWN_MS);
  if (recent) throw new HttpError(429, "Slow down a moment before posting again");
  const g = verified(input);

  let source: ScoreRecord["source"] = "post";
  let daily: string | undefined;
  if (input.daily !== undefined) {
    const key = String(input.daily);
    const today = dayKey(now);
    const yesterday = dayKey(now - 86_400_000);
    if (key !== today && key !== yesterday) throw new HttpError(422, "That daily puzzle is no longer open for posting");
    const id = dailyId(key);
    if (id.baseId !== g.baseId || id.seed !== g.seed) throw new HttpError(422, "That wasn't the daily puzzle");
    source = "daily";
    daily = key;
  }

  const existing = scoresOf(db).find((s) => s.playerId === player.id && s.puzzle === g.puzzle);
  if (existing) {
    if (g.score.total <= existing.score) throw new HttpError(409, `You already have ${fmt(existing.score)} on this puzzle`);
    // A better run replaces the old one in place (same id, so links keep working).
    const before = { puzzleTop: puzzleLadder(db, g.puzzle)[0], tierTop: tierBoard(db, g.difficulty)[0] };
    Object.assign(existing, newScore(player, g, source, now, { daily }), { id: existing.id, challengeOf: existing.challengeOf });
    announce(db, existing, before, undefined, now);
    return {
      entry: toView(db, existing, rankIn(tierBoard(db, existing.difficulty), existing.id) ?? 0, player.id),
      puzzleRank: existing.flagged ? null : rankIn(puzzleLadder(db, existing.puzzle), existing.id),
      boardRank: existing.flagged ? null : rankIn(tierBoard(db, existing.difficulty), existing.id),
      replaced: true,
    };
  }

  const record = newScore(player, g, source, now, { daily });
  const ranks = insert(db, record, undefined, now);
  return { entry: toView(db, record, ranks.boardRank ?? 0, player.id), ...ranks, replaced: false };
}

// ---------------------------------------------------------------------------
// Challenges

function findScore(db: Db, id: string): ScoreRecord {
  const s = scoresOf(db).find((x) => x.id === id);
  if (!s) throw new HttpError(404, "Score not found");
  return s;
}

/** Why this player can't take on the score, or null if they can. */
export function challengeBlock(db: Db, player: PlayerRecord | null, target: ScoreRecord): string | null {
  if (!player) return "Pick a name to take on a challenge";
  if (target.flagged) return "This score is under review";
  if (target.playerId === player.id) return "That's your own score";
  const mine = scoresOf(db).find((s) => s.playerId === player.id && s.puzzle === target.puzzle);
  if (mine) return `You've already scored ${fmt(mine.score)} on this puzzle`;
  if (attemptsOf(db).some((a) => a.playerId === player.id && a.puzzle === target.puzzle)) return "You've already attempted this puzzle";
  return null;
}

/** Locks in the player's single scored attempt and tells them which puzzle to play. */
export function startChallenge(db: Db, player: PlayerRecord, scoreId: string, now = Date.now()): { baseId: string; seed: number } {
  const target = findScore(db, scoreId);
  const block = challengeBlock(db, player, target);
  if (block) throw new HttpError(409, block);
  const attempt: AttemptRecord = { id: newId(), playerId: player.id, scoreId, puzzle: target.puzzle, startedAt: now };
  (db.attempts ??= []).push(attempt);
  return { baseId: target.baseId, seed: target.seed };
}

/** Submits the finished attempt. It must be for the puzzle that was handed out. */
export function submitChallenge(db: Db, player: PlayerRecord, scoreId: string, input: GameInput, now = Date.now()): ChallengeResult {
  const target = findScore(db, scoreId);
  const attempt = attemptsOf(db).find((a) => a.playerId === player.id && a.puzzle === target.puzzle);
  if (!attempt) throw new HttpError(409, "Start the challenge first");
  if (attempt.doneAt) throw new HttpError(409, "You already submitted this attempt");
  const g = verified(input);
  if (g.puzzle !== target.puzzle) throw new HttpError(422, "That isn't the puzzle you were challenged with");
  attempt.doneAt = now;

  const record = newScore(player, g, "challenge", now, { challengeOf: target.id });
  const ranks = insert(db, record, target, now);
  return {
    entry: toView(db, record, ranks.boardRank ?? 0, player.id),
    ...ranks,
    replaced: false,
    beat: record.score > target.score,
    target: { score: target.score, playerName: nameOf(db, target.playerId) },
  };
}

// ---------------------------------------------------------------------------
// Reading

export function listBoard(
  db: Db,
  opts: { board: BoardKind; tier?: string; limit?: number; viewerId?: string; now?: number },
): { entries: ScoreEntryView[] } | { players: PlayerBoardRow[] } {
  const now = opts.now ?? Date.now();
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
  const tier = isDifficulty(opts.tier) ? opts.tier : undefined;
  let rows = scoresOf(db).filter((s) => visible(s) && (!tier || s.difficulty === tier));

  if (opts.board === "players") {
    const per = new Map<string, Map<string, number>>();
    for (const s of rows) {
      const bests = per.get(s.playerId) ?? new Map<string, number>();
      bests.set(s.puzzle, Math.max(bests.get(s.puzzle) ?? 0, s.score));
      per.set(s.playerId, bests);
    }
    const table = [...per].map(([playerId, bests]) => {
      const values = [...bests.values()];
      return { playerId, total: values.reduce((a, b) => a + b, 0), puzzles: values.length, best: Math.max(...values) };
    });
    table.sort((a, b) => b.total - a.total || b.best - a.best);
    return {
      players: table.slice(0, limit).map((r, i) => ({
        rank: i + 1,
        playerId: r.playerId,
        playerName: nameOf(db, r.playerId),
        total: r.total,
        puzzles: r.puzzles,
        best: r.best,
        mine: r.playerId === opts.viewerId,
      })),
    };
  }

  if (opts.board === "week") rows = rows.filter((s) => now - s.at <= WEEK_MS);
  if (opts.board === "daily") {
    const today = dayKey(now);
    rows = rows.filter((s) => s.daily === today);
  }
  rows.sort(byBest);
  return { entries: rows.slice(0, limit).map((s, i) => toView(db, s, i + 1, opts.viewerId)) };
}

export function scoreDetail(db: Db, id: string, viewer: PlayerRecord | null): ScoreDetail {
  const s = findScore(db, id);
  if (s.flagged && s.playerId !== viewer?.id) throw new HttpError(404, "Score not found");
  const ladder = puzzleLadder(db, s.puzzle);
  const rank = (ladder.findIndex((x) => x.id === s.id) + 1) || 0;
  const block = challengeBlock(db, viewer, s);
  return {
    entry: toView(db, s, rank, viewer?.id),
    ladder: ladder.slice(0, 20).map((x, i) => toView(db, x, i + 1, viewer?.id)),
    challenge: block ? { ok: false, reason: block } : { ok: true },
  };
}

/** The puzzle behind a score, rebuilt from the bank (so the client plays the exact same grid). */
export function puzzleOf(db: Db, id: string) {
  const s = findScore(db, id);
  return puzzleFromBase(s.baseId, s.seed);
}

// ---------------------------------------------------------------------------
// Notifications

export function listNotifications(db: Db, playerId: string): { items: NotificationView[]; unread: number } {
  const mine = notificationsOf(db)
    .filter((n) => n.playerId === playerId)
    .sort((a, b) => b.at - a.at);
  return {
    items: mine.slice(0, 50).map(({ id, at, kind, title, body, href, read }) => ({ id, at, kind, title, body, href, read })),
    unread: mine.filter((n) => !n.read).length,
  };
}

export function markRead(db: Db, playerId: string, ids: string[] | "all"): void {
  for (const n of notificationsOf(db)) if (n.playerId === playerId && (ids === "all" || ids.includes(n.id))) n.read = true;
}

void DIFFICULTIES;
