"use client";

// Client helpers for the leaderboard API.
import type { MoveEvent } from "./game";
import { api, post } from "./client";
import type { BoardKind, ChallengeResult, PlayerBoardRow, PostResult, ScoreDetail, ScoreEntryView } from "./types";

/** What the server needs to verify a game: the puzzle's identity, the lives chosen and the move log. */
export interface GameSubmission {
  baseId: string;
  seed: number;
  lives: number;
  log: MoveEvent[];
  daily?: string;
}

export function fetchBoard(board: Exclude<BoardKind, "players">, tier?: string): Promise<{ entries: ScoreEntryView[] }>;
export function fetchBoard(board: "players", tier?: string): Promise<{ players: PlayerBoardRow[] }>;
export function fetchBoard(board: BoardKind, tier?: string) {
  const q = new URLSearchParams({ board });
  if (tier) q.set("tier", tier);
  return api(`/scores?${q}`);
}

export const fetchDetail = (id: string) => api<ScoreDetail>(`/scores/${id}`);
export const postScore = (g: GameSubmission) => post<PostResult>("/scores", g);
export const startChallenge = (id: string) => post<{ baseId: string; seed: number }>(`/scores/${id}`, { action: "start" });
export const challengePuzzle = (id: string) => post<{ baseId: string; seed: number }>(`/scores/${id}`, { action: "puzzle" });
export const submitChallenge = (id: string, g: GameSubmission) => post<ChallengeResult>(`/scores/${id}`, { action: "submit", ...g });
