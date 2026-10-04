import { DEFAULT_TOURNAMENT_TZ, isMonthKey, monthKey } from "@/lib/sudoku/tournament";
import { MAX_LEAGUE_MEMBERS, type LeagueSummary, type LeagueView, type StandingRow } from "@/lib/sudoku/types";
import { HttpError, normaliseCode, randomCode } from "./http";
import type { Db, LeagueRecord, PlayerRecord } from "./store";

const TOURNAMENT_TZ = process.env.TOURNAMENT_TZ ?? DEFAULT_TOURNAMENT_TZ;

export function getLeague(db: Db, rawCode: string): LeagueRecord {
  const league = db.leagues[normaliseCode(rawCode)];
  if (!league) throw new HttpError(404, "League not found — check the invite code");
  return league;
}

export function summarise(league: LeagueRecord): LeagueSummary {
  return { code: league.code, name: league.name, ownerId: league.ownerId, memberCount: league.memberIds.length };
}

export function createLeague(db: Db, player: PlayerRecord, name: string, now = Date.now()): LeagueRecord {
  let code = randomCode(6);
  while (db.leagues[code]) code = randomCode(6);
  const league: LeagueRecord = { code, name, ownerId: player.id, createdAt: now, memberIds: [player.id] };
  db.leagues[code] = league;
  return league;
}

export function joinLeague(league: LeagueRecord, player: PlayerRecord): void {
  if (league.memberIds.includes(player.id)) return;
  if (league.memberIds.length >= MAX_LEAGUE_MEMBERS) throw new HttpError(409, "That league is full");
  league.memberIds.push(player.id);
}

export function leaveLeague(db: Db, league: LeagueRecord, player: PlayerRecord): void {
  league.memberIds = league.memberIds.filter((id) => id !== player.id);
  if (league.memberIds.length === 0) {
    delete db.leagues[league.code];
  } else if (league.ownerId === player.id) {
    league.ownerId = league.memberIds[0];
  }
}

export function myLeagues(db: Db, playerId: string): LeagueSummary[] {
  return Object.values(db.leagues)
    .filter((l) => l.memberIds.includes(playerId))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(summarise);
}

export function computeStandings(db: Db, leagueCode: string, month: string): StandingRow[] {
  const rows = new Map<string, StandingRow & { mistakeTotal: number }>();
  for (const match of db.matches) {
    if (match.leagueCode !== leagueCode || match.month !== month) continue;
    for (const r of match.results) {
      const row = rows.get(r.playerId) ?? {
        playerId: r.playerId,
        name: db.players[r.playerId]?.name ?? "Player",
        rank: 0,
        points: 0,
        matches: 0,
        wins: 0,
        completions: 0,
        bestTimeMs: null,
        avgMistakes: 0,
        mistakeTotal: 0,
      };
      row.points += r.points;
      row.matches += 1;
      row.mistakeTotal += r.mistakes;
      if (r.place === 1) row.wins += 1;
      if (r.completed) {
        row.completions += 1;
        if (r.timeMs !== null && (row.bestTimeMs === null || r.timeMs < row.bestTimeMs)) row.bestTimeMs = r.timeMs;
      }
      rows.set(r.playerId, row);
    }
  }
  const sorted = [...rows.values()].sort(
    (a, b) => b.points - a.points || b.wins - a.wins || b.completions - a.completions || a.matches - b.matches,
  );
  // Competition ranking: ties on points and wins share a rank (1, 2, 2, 4).
  return sorted.map(({ mistakeTotal, ...row }, i) => {
    const prev = sorted[i - 1];
    const tied = prev && prev.points === row.points && prev.wins === row.wins;
    const rank = tied ? sorted.findIndex((r) => r.points === row.points && r.wins === row.wins) + 1 : i + 1;
    return { ...row, rank, avgMistakes: row.matches ? Math.round((mistakeTotal / row.matches) * 10) / 10 : 0 };
  });
}

export function leagueView(db: Db, league: LeagueRecord, viewerId: string | null, rawMonth: unknown): LeagueView {
  const currentMonth = monthKey(Date.now(), TOURNAMENT_TZ);
  const month = isMonthKey(rawMonth) ? rawMonth : currentMonth;
  const recentMatches = db.matches
    .filter((m) => m.leagueCode === league.code && m.month === month)
    .sort((a, b) => b.endedAt - a.endedAt)
    .slice(0, 10)
    .map((m) => {
      const winner = m.results.find((r) => r.place === 1);
      return {
        id: m.id,
        endedAt: m.endedAt,
        difficulty: m.difficulty,
        winner: winner ? (db.players[winner.playerId]?.name ?? "Player") : null,
        players: m.results.length,
      };
    });
  const openRooms = Object.values(db.rooms)
    .filter((r) => r.leagueCode === league.code && r.status !== "finished")
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((r) => ({
      code: r.code,
      difficulty: r.difficulty,
      players: r.members.length,
      maxPlayers: r.maxPlayers,
      status: r.status,
    }));
  return {
    ...summarise(league),
    month,
    currentMonth,
    isMember: viewerId !== null && league.memberIds.includes(viewerId),
    members: league.memberIds.map((id) => ({ id, name: db.players[id]?.name ?? "Player" })),
    standings: computeStandings(db, league.code, month),
    recentMatches,
    openRooms,
  };
}
