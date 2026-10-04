import { generatePuzzle, isDifficulty, MAX_MISTAKES } from "@/lib/sudoku/engine";
import { monthKey, scoreMatch, DEFAULT_TOURNAMENT_TZ } from "@/lib/sudoku/tournament";
import {
  DEFAULT_ROOM_PLAYERS,
  MATCH_TIME_LIMIT_MIN,
  MAX_LEAGUE_MEMBERS,
  MAX_ROOM_PLAYERS,
  MIN_ROOM_PLAYERS,
  type MoveResult,
  type RoomPlayerView,
  type RoomView,
} from "@/lib/sudoku/types";
import { HttpError, newId, normaliseCode, randomCode } from "./http";
import type { Db, MatchResult, PlayerRecord, RoomMember, RoomRecord } from "./store";

const COUNTDOWN_MS = 3_000;
const ONLINE_WINDOW_MS = 12_000;
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const TOURNAMENT_TZ = process.env.TOURNAMENT_TZ ?? DEFAULT_TOURNAMENT_TZ;

// Presence is ephemeral, so it stays in memory instead of the data file.
const globalPresence = globalThis as typeof globalThis & { __sudokuPresence?: Map<string, number> };
const presence = (globalPresence.__sudokuPresence ??= new Map<string, number>());

export function touchPresence(code: string, playerId: string, now = Date.now()): void {
  presence.set(`${code}:${playerId}`, now);
}

function isOnline(code: string, playerId: string, now: number): boolean {
  return now - (presence.get(`${code}:${playerId}`) ?? 0) < ONLINE_WINDOW_MS;
}

export function getRoom(db: Db, rawCode: string): RoomRecord {
  const room = db.rooms[normaliseCode(rawCode)];
  if (!room) throw new HttpError(404, "Room not found — check the invite code");
  return room;
}

function getMember(room: RoomRecord, playerId: string): RoomMember {
  const member = room.members.find((m) => m.playerId === playerId);
  if (!member) throw new HttpError(403, "You are not in this room");
  return member;
}

function requireHost(room: RoomRecord, playerId: string): void {
  if (room.hostId !== playerId) throw new HttpError(403, "Only the host can do that");
}

const filledCount = (room: RoomRecord, m: RoomMember) => {
  if (!room.puzzle) return 0;
  let n = 0;
  for (let i = 0; i < 81; i++) if (room.puzzle[i] === "0" && m.board[i] !== "0") n++;
  return n;
};

/** Finishers by time, then everyone else by progress, then fewest mistakes. */
function standings(room: RoomRecord): RoomMember[] {
  return [...room.members].sort((a, b) => {
    if (a.finishedMs !== null || b.finishedMs !== null) {
      if (a.finishedMs === null) return 1;
      if (b.finishedMs === null) return -1;
      return a.finishedMs - b.finishedMs;
    }
    if (a.eliminated !== b.eliminated && room.status === "playing") return a.eliminated ? 1 : -1;
    return filledCount(room, b) - filledCount(room, a) || a.mistakes - b.mistakes;
  });
}

function pruneRooms(db: Db, now: number): void {
  for (const [code, room] of Object.entries(db.rooms)) {
    if (now - room.updatedAt > ROOM_TTL_MS) delete db.rooms[code];
  }
}

export function needsFinalize(room: RoomRecord, now: number): boolean {
  if (room.status !== "playing") return false;
  if (room.endsAt !== null && now >= room.endsAt) return true;
  return room.members.every((m) => m.finishedMs !== null || m.eliminated);
}

/** Ends the round if everyone is done or time is up, and records league results. */
export function finalizeIfDone(db: Db, room: RoomRecord, now: number, force = false): void {
  if (room.status !== "playing" || (!force && !needsFinalize(room, now))) return;
  room.status = "finished";
  room.finishedAt = Math.min(now, room.endsAt ?? now);
  room.updatedAt = now;
  room.points = null;

  if (!room.leagueCode || !db.leagues[room.leagueCode] || room.members.length < MIN_ROOM_PLAYERS) return;

  let place = 0;
  const results: MatchResult[] = standings(room).map((m) => {
    const completed = m.finishedMs !== null;
    const result = {
      playerId: m.playerId,
      completed,
      place: completed ? ++place : null,
      mistakes: m.mistakes,
      timeMs: m.finishedMs,
      filled: filledCount(room, m),
      points: 0,
    };
    result.points = scoreMatch(room.difficulty, result);
    return result;
  });
  room.points = Object.fromEntries(results.map((r) => [r.playerId, r.points]));
  db.matches.push({
    id: newId(),
    leagueCode: room.leagueCode,
    roomCode: room.code,
    difficulty: room.difficulty,
    endedAt: room.finishedAt,
    month: monthKey(room.finishedAt, TOURNAMENT_TZ),
    results,
  });
}

export function roomView(db: Db, room: RoomRecord, viewerId: string | null, now = Date.now()): RoomView {
  const league = room.leagueCode ? db.leagues[room.leagueCode] : null;
  const toFill = room.puzzle ? [...room.puzzle].filter((c) => c === "0").length : 0;
  const ordered = standings(room);
  const players: RoomPlayerView[] = ordered.map((m, index) => ({
    id: m.playerId,
    name: db.players[m.playerId]?.name ?? "Player",
    isHost: m.playerId === room.hostId,
    online: isOnline(room.code, m.playerId, now),
    filled: filledCount(room, m),
    mistakes: m.mistakes,
    finishedMs: m.finishedMs,
    eliminated: m.eliminated,
    rank: index + 1,
    points: room.points?.[m.playerId] ?? null,
  }));
  const me = viewerId ? room.members.find((m) => m.playerId === viewerId) : undefined;
  // Hide the grid until the countdown ends so nobody gets a head start.
  const revealed = room.status === "finished" || (room.status === "playing" && now >= (room.startedAt ?? 0));
  return {
    code: room.code,
    hostId: room.hostId,
    difficulty: room.difficulty,
    maxPlayers: room.maxPlayers,
    league: league ? { code: league.code, name: league.name } : null,
    status: room.status,
    round: room.round,
    startedAt: room.startedAt,
    endsAt: room.endsAt,
    finishedAt: room.finishedAt,
    serverNow: now,
    toFill,
    puzzle: revealed ? room.puzzle : null,
    solution: room.status === "finished" ? room.solution : null,
    players,
    me: me
      ? {
          board: revealed ? me.board : "0".repeat(81),
          mistakes: me.mistakes,
          finishedMs: me.finishedMs,
          eliminated: me.eliminated,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Commands

export function createRoom(
  db: Db,
  player: PlayerRecord,
  input: { difficulty?: unknown; maxPlayers?: unknown; leagueCode?: unknown },
  now = Date.now(),
): RoomRecord {
  const difficulty = isDifficulty(input.difficulty) ? input.difficulty : "medium";
  const requested = Number(input.maxPlayers ?? DEFAULT_ROOM_PLAYERS);
  const maxPlayers = Math.min(
    MAX_ROOM_PLAYERS,
    Math.max(MIN_ROOM_PLAYERS, Number.isFinite(requested) ? Math.round(requested) : DEFAULT_ROOM_PLAYERS),
  );
  let leagueCode: string | null = null;
  if (typeof input.leagueCode === "string" && input.leagueCode) {
    const league = db.leagues[normaliseCode(input.leagueCode)];
    if (!league) throw new HttpError(404, "League not found");
    if (!league.memberIds.includes(player.id)) throw new HttpError(403, "Join the league first");
    leagueCode = league.code;
  }

  pruneRooms(db, now);
  let code = randomCode(6);
  while (db.rooms[code]) code = randomCode(6);
  const room: RoomRecord = {
    code,
    hostId: player.id,
    difficulty,
    maxPlayers,
    leagueCode,
    status: "lobby",
    round: 0,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    endsAt: null,
    finishedAt: null,
    puzzle: null,
    solution: null,
    members: [],
    points: null,
  };
  room.members.push(newMember(player.id, now));
  db.rooms[code] = room;
  return room;
}

function newMember(playerId: string, now: number): RoomMember {
  return { playerId, joinedAt: now, board: "0".repeat(81), mistakes: 0, finishedMs: null, eliminated: false };
}

export function joinRoom(db: Db, room: RoomRecord, player: PlayerRecord, now = Date.now()): void {
  if (room.members.some((m) => m.playerId === player.id)) return;
  if (room.status === "playing") throw new HttpError(409, "This match is already underway — wait for the next round");
  if (room.members.length >= room.maxPlayers) throw new HttpError(409, `Room is full (${room.maxPlayers} players)`);

  // Joining a league room via an invite link also enrols you in that league.
  const league = room.leagueCode ? db.leagues[room.leagueCode] : null;
  if (league && !league.memberIds.includes(player.id)) {
    if (league.memberIds.length >= MAX_LEAGUE_MEMBERS) throw new HttpError(409, "That league is full");
    league.memberIds.push(player.id);
  }
  room.members.push(newMember(player.id, now));
  room.updatedAt = now;
}

export function leaveRoom(db: Db, room: RoomRecord, playerId: string, now = Date.now()): void {
  const member = getMember(room, playerId);
  if (room.status === "playing") {
    // Leaving mid-match counts as a forfeit so results stay honest.
    if (member.finishedMs === null) member.eliminated = true;
    finalizeIfDone(db, room, now);
  } else {
    room.members = room.members.filter((m) => m.playerId !== playerId);
  }
  if (room.members.length === 0) {
    delete db.rooms[room.code];
    return;
  }
  if (room.hostId === playerId) {
    room.hostId = (room.members.find((m) => m.playerId !== playerId) ?? room.members[0]).playerId;
  }
  room.updatedAt = now;
}

export function updateSettings(
  room: RoomRecord,
  playerId: string,
  input: { difficulty?: unknown; maxPlayers?: unknown },
  now = Date.now(),
): void {
  requireHost(room, playerId);
  if (room.status === "playing") throw new HttpError(409, "Settings are locked during a match");
  if (isDifficulty(input.difficulty)) room.difficulty = input.difficulty;
  if (input.maxPlayers !== undefined) {
    const n = Math.round(Number(input.maxPlayers));
    if (!Number.isFinite(n) || n < Math.max(MIN_ROOM_PLAYERS, room.members.length) || n > MAX_ROOM_PLAYERS) {
      throw new HttpError(400, `Max players must be between ${Math.max(MIN_ROOM_PLAYERS, room.members.length)} and ${MAX_ROOM_PLAYERS}`);
    }
    room.maxPlayers = n;
  }
  room.updatedAt = now;
}

export function startRoom(room: RoomRecord, playerId: string, now = Date.now()): void {
  requireHost(room, playerId);
  if (room.status === "playing") throw new HttpError(409, "Match already started");
  const { puzzle, solution } = generatePuzzle(room.difficulty);
  room.status = "playing";
  room.round += 1;
  room.puzzle = puzzle;
  room.solution = solution;
  room.startedAt = now + COUNTDOWN_MS;
  room.endsAt = room.startedAt + MATCH_TIME_LIMIT_MIN[room.difficulty] * 60_000;
  room.finishedAt = null;
  room.points = null;
  room.members = room.members.map((m) => ({ ...newMember(m.playerId, m.joinedAt), board: puzzle }));
  room.updatedAt = now;
}

export function endRoom(db: Db, room: RoomRecord, playerId: string, now = Date.now()): void {
  requireHost(room, playerId);
  if (room.status !== "playing") throw new HttpError(409, "No match in progress");
  finalizeIfDone(db, room, now, true);
}

export function backToLobby(room: RoomRecord, playerId: string, now = Date.now()): void {
  requireHost(room, playerId);
  if (room.status !== "finished") throw new HttpError(409, "Finish the current match first");
  room.status = "lobby";
  room.puzzle = null;
  room.solution = null;
  room.startedAt = null;
  room.endsAt = null;
  room.finishedAt = null;
  room.points = null;
  room.members = room.members.map((m) => newMember(m.playerId, m.joinedAt));
  room.updatedAt = now;
}

export function applyMove(
  db: Db,
  room: RoomRecord,
  playerId: string,
  input: { index?: unknown; value?: unknown },
  now = Date.now(),
): Omit<MoveResult, "room"> {
  const member = getMember(room, playerId);
  finalizeIfDone(db, room, now);
  if (room.status !== "playing" || !room.puzzle || !room.solution) throw new HttpError(409, "The match is over");
  if (now < (room.startedAt ?? 0)) throw new HttpError(409, "Wait for the countdown");
  if (member.eliminated) throw new HttpError(409, `You're out — ${MAX_MISTAKES} mistakes`);
  if (member.finishedMs !== null) throw new HttpError(409, "You already finished");

  const index = Number(input.index);
  const value = Number(input.value);
  if (!Number.isInteger(index) || index < 0 || index > 80) throw new HttpError(400, "Invalid cell");
  if (!Number.isInteger(value) || value < 1 || value > 9) throw new HttpError(400, "Invalid number");
  if (room.puzzle[index] !== "0") throw new HttpError(400, "That cell is a given");
  if (member.board[index] !== "0") throw new HttpError(400, "That cell is already solved");

  const correct = room.solution[index] === String(value);
  if (correct) {
    member.board = member.board.slice(0, index) + value + member.board.slice(index + 1);
    if (member.board === room.solution) member.finishedMs = now - (room.startedAt ?? now);
  } else {
    member.mistakes += 1;
    if (member.mistakes >= MAX_MISTAKES) member.eliminated = true;
  }
  room.updatedAt = now;
  finalizeIfDone(db, room, now);
  return { correct, mistakes: member.mistakes, eliminated: member.eliminated, finishedMs: member.finishedMs };
}
