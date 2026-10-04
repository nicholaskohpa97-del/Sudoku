"use client";

import { ArrowRight, Pencil, ShieldCheck, Trophy, User, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, formatDuration, post, usePlayer } from "@/lib/sudoku/client";
import { DIFFICULTIES, DIFFICULTY_CONFIG, MAX_MISTAKES, type Difficulty } from "@/lib/sudoku/engine";
import { loadStats, type SoloStats } from "@/lib/sudoku/stats";
import {
  DEFAULT_ROOM_PLAYERS,
  MAX_ROOM_PLAYERS,
  MIN_ROOM_PLAYERS,
  type LeagueSummary,
  type RoomView,
} from "@/lib/sudoku/types";
import { NameForm } from "./NameGate";
import { buttonStyles, Field, inputStyles, Panel, Toast, useIsClient, useToast } from "./ui";

export function SudokuHub() {
  const { player, ready } = usePlayer();
  const { toast, show } = useToast();

  return (
    <div className="space-y-8">
      <header className="space-y-3 text-center">
        <h1 className="font-display text-5xl sm:text-6xl">Sudoku</h1>
        <p className="mx-auto max-w-lg text-stone-400">
          Four difficulty levels, {MAX_MISTAKES} mistakes allowed, instant feedback, and private rooms for up to{" "}
          {MAX_ROOM_PLAYERS} friends with a monthly tournament.
        </p>
        <p className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
          <ShieldCheck className="size-3.5" /> No ads · no trackers · no third-party scripts
        </p>
      </header>

      <SoloSection />

      {ready ? (
        player ? (
          <>
            <ProfileBar name={player.name} />
            <div className="grid gap-6 lg:grid-cols-2">
              <MultiplayerSection show={show} />
              <TournamentSection show={show} />
            </div>
          </>
        ) : (
          <Panel className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-medium">
              <Users className="size-5 text-amber-300" /> Play with friends & family
            </h2>
            <p className="text-sm text-stone-400">
              Choose a display name to create or join rooms and tournaments. No sign-up, email or password.
            </p>
            <NameForm submitLabel="Continue" />
          </Panel>
        )
      ) : null}
      <Toast toast={toast} />
    </div>
  );
}

function SoloSection() {
  const isClient = useIsClient();
  const stats: Partial<Record<Difficulty, SoloStats>> = isClient ? loadStats() : {};
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <User className="size-5 text-amber-300" /> Solo
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {DIFFICULTIES.map((d) => {
          const s = stats[d];
          return (
            <Link
              key={d}
              href={`/sudoku/play/${d}`}
              className="group rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-amber-300/40 hover:bg-white/[0.06]"
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-2xl">{DIFFICULTY_CONFIG[d].label}</span>
                <ArrowRight className="size-4 text-stone-500 transition group-hover:translate-x-0.5 group-hover:text-amber-300" />
              </div>
              <p className="mt-1 text-xs text-stone-400">{DIFFICULTY_CONFIG[d].blurb}</p>
              <p className="mt-3 text-[0.7rem] text-stone-500">
                {s?.played
                  ? `Won ${s.won}/${s.played}${s.bestMs !== null ? ` · best ${formatDuration(s.bestMs)}` : ""}`
                  : "Not played yet"}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function ProfileBar({ name }: { name: string }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-3">
      {editing ? (
        <div className="w-full">
          <NameForm initial={name} onDone={() => setEditing(false)} />
        </div>
      ) : (
        <>
          <p className="text-sm text-stone-300">
            Playing as <span className="font-medium text-stone-50">{name}</span>
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-100"
          >
            <Pencil className="size-3.5" /> Change name
          </button>
        </>
      )}
    </div>
  );
}

function useMyLeagues() {
  const [leagues, setLeagues] = useState<LeagueSummary[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    api<LeagueSummary[]>("/leagues")
      .then((l) => !cancelled && setLeagues(l))
      .catch(() => !cancelled && setLeagues([]));
    return () => {
      cancelled = true;
    };
  }, []);
  return leagues;
}

type ShowToast = ReturnType<typeof useToast>["show"];

function MultiplayerSection({ show }: { show: ShowToast }) {
  const router = useRouter();
  const leagues = useMyLeagues();
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [maxPlayers, setMaxPlayers] = useState(DEFAULT_ROOM_PLAYERS);
  const [leagueCode, setLeagueCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Panel className="space-y-5">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <Users className="size-5 text-amber-300" /> Multiplayer
      </h2>
      <p className="text-sm text-stone-400">
        Everyone gets the same puzzle and races to finish. You see each other&apos;s progress live, not their numbers.
      </p>

      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const room = await post<RoomView>("/rooms", { difficulty, maxPlayers, leagueCode: leagueCode || undefined });
            router.push(`/sudoku/room/${room.code}`);
          } catch (err) {
            show((err as Error).message, "error");
            setBusy(false);
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Difficulty">
            <select className={inputStyles} value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {DIFFICULTY_CONFIG[d].label}
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
              className="w-full accent-amber-300"
            />
          </Field>
        </div>
        {leagues?.length ? (
          <Field label="Counts toward tournament">
            <select className={inputStyles} value={leagueCode} onChange={(e) => setLeagueCode(e.target.value)}>
              <option value="">No — casual match</option>
              {leagues.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <button type="submit" disabled={busy} className={`${buttonStyles.primary} w-full`}>
          Create room
        </button>
      </form>

      <form
        className="space-y-2 border-t border-white/10 pt-5"
        onSubmit={(e) => {
          e.preventDefault();
          const code = joinCode.trim().toUpperCase();
          if (code) router.push(`/sudoku/room/${encodeURIComponent(code)}`);
        }}
      >
        <Field label="Join a room">
          <div className="flex gap-2">
            <input
              className={`${inputStyles} font-mono tracking-widest uppercase`}
              placeholder="ABC123"
              value={joinCode}
              maxLength={6}
              onChange={(e) => setJoinCode(e.target.value)}
            />
            <button type="submit" className={buttonStyles.secondary} disabled={!joinCode.trim()}>
              Join
            </button>
          </div>
        </Field>
      </form>
    </Panel>
  );
}

function TournamentSection({ show }: { show: ShowToast }) {
  const router = useRouter();
  const leagues = useMyLeagues();
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Panel className="space-y-5">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <Trophy className="size-5 text-amber-300" /> Tournaments
      </h2>
      <p className="text-sm text-stone-400">
        A tournament is a private group, such as your family or your friends from school. Every match played in it
        earns points, and the standings reset each month.
      </p>

      {leagues === null ? (
        <p className="text-sm text-stone-500">Loading…</p>
      ) : leagues.length ? (
        <ul className="space-y-2">
          {leagues.map((l) => (
            <li key={l.code}>
              <Link
                href={`/sudoku/league/${l.code}`}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 transition hover:border-amber-300/40"
              >
                <span>{l.name}</span>
                <span className="text-xs text-stone-400">
                  {l.memberCount} {l.memberCount === 1 ? "member" : "members"} →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-stone-500">You&apos;re not in any tournaments yet.</p>
      )}

      <form
        className="space-y-2 border-t border-white/10 pt-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const league = await post<LeagueSummary>("/leagues", { name });
            router.push(`/sudoku/league/${league.code}`);
          } catch (err) {
            show((err as Error).message, "error");
            setBusy(false);
          }
        }}
      >
        <Field label="Create a tournament">
          <div className="flex gap-2">
            <input
              className={inputStyles}
              placeholder="e.g. Tan Family League"
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit" className={buttonStyles.primary} disabled={busy || !name.trim()}>
              Create
            </button>
          </div>
        </Field>
      </form>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const code = joinCode.trim().toUpperCase();
          if (code) router.push(`/sudoku/league/${encodeURIComponent(code)}`);
        }}
      >
        <Field label="Join with a code">
          <div className="flex gap-2">
            <input
              className={`${inputStyles} font-mono tracking-widest uppercase`}
              placeholder="XYZ789"
              value={joinCode}
              maxLength={6}
              onChange={(e) => setJoinCode(e.target.value)}
            />
            <button type="submit" className={buttonStyles.secondary} disabled={!joinCode.trim()}>
              Open
            </button>
          </div>
        </Field>
      </form>
    </Panel>
  );
}
