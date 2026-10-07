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
