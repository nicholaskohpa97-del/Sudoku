"use client";

import { ChevronLeft, ChevronRight, Info, LogOut, Medal, Play, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, formatDuration, post, usePlayer } from "@/lib/sudoku/client";
import { DIFFICULTIES, DIFFICULTY_CONFIG, type Difficulty } from "@/lib/sudoku/engine";
import {
  BASE_POINTS,
  FLAWLESS_BONUS,
  formatMonth,
  PARTICIPATION_POINTS,
  PODIUM_BONUS,
  shiftMonth,
} from "@/lib/sudoku/tournament";
import { DEFAULT_ROOM_PLAYERS, MAX_ROOM_PLAYERS, MIN_ROOM_PLAYERS, type LeagueView, type RoomView } from "@/lib/sudoku/types";
import { NameGate } from "./NameGate";
import { BackLink, buttonStyles, Field, inputStyles, InviteButtons, Panel, Toast, useToast } from "./ui";

export function LeagueScreen({ code }: { code: string }) {
  return (
    <NameGate title="Join the tournament">
      <LeagueBody code={code} />
    </NameGate>
  );
}

const MEDAL = ["fill-yellow-300 text-yellow-300", "fill-stone-300 text-stone-300", "fill-orange-400 text-orange-400"];

function LeagueBody({ code }: { code: string }) {
  const { player } = usePlayer();
  const router = useRouter();
  const [month, setMonth] = useState<string | null>(null);
  const [league, setLeague] = useState<LeagueView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [maxPlayers, setMaxPlayers] = useState(DEFAULT_ROOM_PLAYERS);
  const [busy, setBusy] = useState(false);
  const { toast, show } = useToast();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const view = await api<LeagueView>(`/leagues/${code}${month ? `?month=${month}` : ""}`);
        if (!cancelled) {
          setLeague(view);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    };
    load();
    const id = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [code, month]);

  if (error && !league) {
    return (
      <Panel className="mx-auto max-w-md space-y-4 text-center">
        <p>{error}</p>
        <BackLink label="Back to Sudoku" />
      </Panel>
    );
  }
  if (!league || !player) return <p className="text-center text-stone-400">Loading tournament…</p>;

  const viewingCurrent = league.month === league.currentMonth;
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <BackLink />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-xs font-semibold tracking-[0.3em] text-pink-200 uppercase">Monthly tournament</p>
          <h1 className="font-display text-4xl font-bold text-yellow-200 text-glow-gold sm:text-5xl">🏆 {league.name}</h1>
          <p className="mt-1 text-sm text-stone-400">
            <Users className="mr-1 inline size-4" />
            {league.memberCount} {league.memberCount === 1 ? "member" : "members"} · code{" "}
            <span className="font-num font-bold tracking-widest text-cyan-200">{league.code}</span>
          </p>
        </div>
        {league.isMember ? (
          <InviteButtons
            path={`/sudoku/league/${league.code}`}
            title={league.name}
            text={`Join my Sudoku tournament "${league.name}"`}
          />
        ) : (
          <button
            type="button"
            disabled={busy}
            className={buttonStyles.primary}
            onClick={() => run(async () => setLeague(await post<LeagueView>(`/leagues/${code}`, { action: "join" })))}
          >
            Join this tournament
          </button>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel className="space-y-4 self-start !p-0">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <button
              type="button"
              aria-label="Previous month"
              className="rounded-md p-1.5 text-stone-400 hover:bg-white/10 hover:text-stone-100"
              onClick={() => setMonth(shiftMonth(league.month, -1))}
            >
              <ChevronLeft className="size-5" />
            </button>
            <h2 className="flex items-center gap-2 font-medium">
              <Trophy className="size-4 text-yellow-300" /> {formatMonth(league.month)}
              {viewingCurrent ? <span className="animate-pulse text-xs font-bold text-lime-300">● live</span> : null}
            </h2>
            <button
              type="button"
              aria-label="Next month"
              disabled={viewingCurrent}
              className="rounded-md p-1.5 text-stone-400 hover:bg-white/10 hover:text-stone-100 disabled:opacity-20"
              onClick={() => setMonth(shiftMonth(league.month, 1))}
            >
              <ChevronRight className="size-5" />
            </button>
          </div>

          {league.standings.length === 0 ? (
            <p className="px-5 pb-6 text-center text-sm text-stone-400">
              No matches yet in {formatMonth(league.month)}.
              {viewingCurrent ? " Start one below to get on the board." : ""}
            </p>
          ) : (
            <div className="overflow-x-auto px-2 pb-3">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-stone-500">
                  <tr>
                    <th className="px-3 py-2 font-normal">#</th>
                    <th className="px-3 py-2 font-normal">Player</th>
                    <th className="px-3 py-2 text-right font-normal">Pts</th>
                    <th className="px-3 py-2 text-right font-normal" title="Wins">W</th>
                    <th className="hidden px-3 py-2 text-right font-normal sm:table-cell" title="Completed / played">
                      Solved
                    </th>
                    <th className="hidden px-3 py-2 text-right font-normal sm:table-cell">Best</th>
                    <th className="hidden px-3 py-2 text-right font-normal md:table-cell" title="Average mistakes">
                      Avg ✗
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {league.standings.map((row) => (
                    <tr
                      key={row.playerId}
                      className={`border-t border-white/5 ${row.playerId === player.id ? "bg-cyan-300/[0.08]" : ""}`}
                    >
                      <td className="px-3 py-2.5 tabular-nums">
                        {row.rank <= 3 ? (
                          <Medal className={`size-4 ${MEDAL[row.rank - 1]}`} aria-label={`Rank ${row.rank}`} />
                        ) : (
                          row.rank
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {row.name}
                        {row.playerId === player.id ? <span className="text-stone-500"> (you)</span> : null}
                      </td>
                      <td className="px-3 py-2.5 text-right font-num font-bold text-yellow-200 tabular-nums">{row.points}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{row.wins}</td>
                      <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">
                        {row.completions}/{row.matches}
                      </td>
                      <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">
                        {row.bestTimeMs !== null ? formatDuration(row.bestTimeMs) : "—"}
                      </td>
                      <td className="hidden px-3 py-2.5 text-right tabular-nums md:table-cell">{row.avgMistakes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <aside className="space-y-4">
          {league.isMember ? (
            <Panel className="space-y-4 !p-4">
              <h3 className="font-display font-semibold">Start a tournament match</h3>
              <Field label="Difficulty">
                <select
                  className={inputStyles}
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                >
                  {DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {DIFFICULTY_CONFIG[d].label} · {BASE_POINTS[d]} pts
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`Max players: ${maxPlayers}`}>
                <input
                  type="range"
                  min={MIN_ROOM_PLAYERS}
                  max={MAX_ROOM_PLAYERS}
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(Number(e.target.value))}
                  className="w-full accent-pink-400"
                />
              </Field>
              <button
                type="button"
                disabled={busy}
                className={`${buttonStyles.primary} w-full`}
                onClick={() =>
                  run(async () => {
                    const room = await post<RoomView>("/rooms", { difficulty, maxPlayers, leagueCode: league.code });
                    router.push(`/sudoku/room/${room.code}`);
                  })
                }
              >
                <Play className="size-4 fill-night" /> Create race room
              </button>
            </Panel>
          ) : null}

          {league.openRooms.length ? (
            <Panel className="space-y-2 !p-4">
              <h3 className="font-display font-semibold">Open rooms</h3>
              {league.openRooms.map((r) => (
                <Link
                  key={r.code}
                  href={`/sudoku/room/${r.code}`}
                  className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-sm hover:bg-white/[0.07]"
                >
                  <span className="font-num font-bold tracking-widest text-cyan-200">{r.code}</span>
                  <span className="text-stone-400">
                    {DIFFICULTY_CONFIG[r.difficulty].label} · {r.players}/{r.maxPlayers}
                    {r.status === "playing" ? " · in play" : ""}
                  </span>
                </Link>
              ))}
            </Panel>
          ) : null}

          {league.recentMatches.length ? (
            <Panel className="space-y-2 !p-4">
              <h3 className="font-display font-semibold">Recent matches</h3>
              <ul className="space-y-1.5 text-sm">
                {league.recentMatches.map((m) => (
                  <li key={m.id} className="flex justify-between gap-2 text-stone-300">
                    <span className="truncate">
                      {m.winner ? `🏆 ${m.winner}` : "No finisher"}{" "}
                      <span className="text-stone-500">
                        · {DIFFICULTY_CONFIG[m.difficulty].label} · {m.players}p
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-stone-500">
                      {new Date(m.endedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel className="space-y-2 !p-4 text-xs text-stone-400">
            <h3 className="flex items-center gap-1.5 text-sm font-medium text-stone-200">
              <Info className="size-4" /> How points work
            </h3>
            <p>
              Solve a match puzzle to earn{" "}
              {DIFFICULTIES.map((d) => `${BASE_POINTS[d]} (${DIFFICULTY_CONFIG[d].label})`).join(", ")}.
            </p>
            <p>
              Fastest solvers get a bonus: +{PODIUM_BONUS.map((b) => `${b * 100}%`).join(" / +")} for 1st / 2nd / 3rd.
              A flawless solve (no mistakes) adds +{FLAWLESS_BONUS}.
            </p>
            <p>
              Out of mistakes or out of time: +{PARTICIPATION_POINTS} for taking part. Only matches with at least{" "}
              {MIN_ROOM_PLAYERS} players count. Standings reset on the 1st of each month.
            </p>
          </Panel>

          <Panel className="space-y-2 !p-4">
            <h3 className="font-display font-semibold">Members</h3>
            <p className="text-sm text-stone-400">{league.members.map((m) => m.name).join(", ")}</p>
            {league.isMember ? (
              <button
                type="button"
                className="mt-2 flex items-center gap-1.5 text-xs text-rose-300/80 hover:text-rose-200"
                onClick={() => {
                  if (!confirm(`Leave ${league.name}? Your past results stay in the standings.`)) return;
                  run(async () => {
                    await post(`/leagues/${code}`, { action: "leave" });
                    router.push("/sudoku");
                  });
                }}
              >
                <LogOut className="size-3.5" /> Leave tournament
              </button>
            ) : null}
          </Panel>
        </aside>
      </div>
      <Toast toast={toast} />
    </div>
  );
}
