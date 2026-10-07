// Wire types shared by the API route handlers and the client.
import type { Difficulty } from "./engine";

export const MIN_ROOM_PLAYERS = 2;
export const MAX_ROOM_PLAYERS = 20;
export const DEFAULT_ROOM_PLAYERS = 10;
export const MAX_LEAGUE_MEMBERS = 50;

/** Hard stop for a multiplayer match, by difficulty. */
export const MATCH_TIME_LIMIT_MIN: Record<Difficulty, number> = {
  beginner: 15,
  easy: 20,
  medium: 30,
  hard: 45,
  expert: 60,
  master: 90,
};

export type RoomStatus = "lobby" | "playing" | "finished";

export interface PlayerSession {
  id: string;
  name: string;
  token: string;
}

export interface RoomPlayerView {
  id: string;
  name: string;
  isHost: boolean;
  online: boolean;
  /** Correct cells the player has filled in (excludes givens). */
  filled: number;
  mistakes: number;
  finishedMs: number | null;
  eliminated: boolean;
  /** Live standing (1 = leading). */
  rank: number;
  /** Tournament points awarded, once the match is over and league-linked. */
  points: number | null;
}

export interface RoomView {
  code: string;
  hostId: string;
  difficulty: Difficulty;
  maxPlayers: number;
  /** Lives each player gets this match (the host chooses). */
  lives: number;
  league: { code: string; name: string } | null;
  status: RoomStatus;
  round: number;
  startedAt: number | null;
  endsAt: number | null;
  finishedAt: number | null;
  serverNow: number;
  /** Number of empty cells in the puzzle. */
  toFill: number;
  puzzle: string | null;
  /** Revealed only once the match is over. */
  solution: string | null;
  players: RoomPlayerView[];
  me: {
    board: string;
    mistakes: number;
    finishedMs: number | null;
    eliminated: boolean;
  } | null;
}

export interface MoveResult {
  correct: boolean;
  mistakes: number;
  eliminated: boolean;
  finishedMs: number | null;
  room: RoomView;
}

export interface LeagueSummary {
  code: string;
  name: string;
  ownerId: string;
  memberCount: number;
}

export interface StandingRow {
  playerId: string;
  name: string;
  rank: number;
  points: number;
  matches: number;
  wins: number;
  completions: number;
  bestTimeMs: number | null;
  avgMistakes: number;
}

export interface LeagueView extends LeagueSummary {
  month: string;
  currentMonth: string;
  isMember: boolean;
  members: { id: string; name: string }[];
  standings: StandingRow[];
  recentMatches: {
    id: string;
    endedAt: number;
    difficulty: Difficulty;
    winner: string | null;
    players: number;
  }[];
  openRooms: { code: string; difficulty: Difficulty; players: number; maxPlayers: number; status: RoomStatus }[];
}

export interface ApiError {
  error: string;
}

// ---------------------------------------------------------------------------
// Leaderboard

export interface ScoreEntryView {
  id: string;
  /** 1-based position on the board it was fetched for. */
  rank: number;
  playerId: string;
  playerName: string;
  difficulty: Difficulty;
  rating: number;
  score: number;
  elapsedMs: number;
  parMs: number;
  /** Lives chosen. */
  lives: number;
  livesLost: number;
  hints: number;
  maxCombo: number;
  at: number;
  source: "post" | "daily" | "challenge";
  daily?: string;
  baseId: string;
  seed: number;
  mine: boolean;
  /** Only ever true for the owner: held off the public boards for review. */
  flagged?: boolean;
}

export interface PlayerBoardRow {
  rank: number;
  playerId: string;
  playerName: string;
  /** Sum of each puzzle's best score. */
  total: number;
  puzzles: number;
  best: number;
  mine: boolean;
}

export type BoardKind = "all" | "week" | "daily" | "players";

export interface ScoreDetail {
  entry: ScoreEntryView;
  /** Everyone's result on this same puzzle, best first. */
  ladder: ScoreEntryView[];
  /** What the viewer can do with it. */
  challenge: { ok: true } | { ok: false; reason: string };
}

export interface NotificationView {
  id: string;
  at: number;
  kind: "dethroned" | "dethroned-board" | "beaten";
  title: string;
  body: string;
  href: string;
  read: boolean;
}

export interface PostResult {
  entry: ScoreEntryView;
  /** Position on this puzzle's ladder and on its level's all-time board. */
  puzzleRank: number | null;
  boardRank: number | null;
  replaced: boolean;
}

export interface ChallengeResult extends PostResult {
  beat: boolean;
  target: { score: number; playerName: string };
}
