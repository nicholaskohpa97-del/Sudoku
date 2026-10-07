"use client";

import { CalendarDays, Check, ChevronRight, Flame, Play, Star, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, formatDuration, post, usePlayer } from "@/lib/sudoku/client";
import { DIFFICULTIES, DIFFICULTY_CONFIG, type Difficulty } from "@/lib/sudoku/engine";
import { parseInviteCode } from "@/lib/sudoku/invite";
import { useProgress } from "@/lib/sudoku/profile";
import { ACHIEVEMENTS, dailyDifficulty, dayKey, levelInfo, liveStreak, PAR_MS } from "@/lib/sudoku/progress";
import { loadStats, type SoloStats } from "@/lib/sudoku/stats";
import {
  DEFAULT_ROOM_PLAYERS,
  MAX_ROOM_PLAYERS,
  MIN_ROOM_PLAYERS,
  type LeagueSummary,
  type RoomView,
} from "@/lib/sudoku/types";
import { NameForm } from "./NameGate";
import { loadDailyDone, loadSavedGame } from "./SoloGame";
import { DIFFICULTY_STYLE } from "./theme";
import { Avatar, buttonStyles, Field, inputStyles, Panel, SectionTitle, Toast, useIsClient, useToast } from "./ui";

export function SudokuHub() {
  const { player, ready } = usePlayer();
  const { toast, show } = useToast();

  return (
    <div className="space-y-8">
      <PlayerCard name={player?.name ?? null} />
      <DailyHero />
      <SoloSection />

      {ready ? (
        player ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <MultiplayerSection show={show} />
            <TournamentSection show={show} />
          </div>
        ) : (
          <Panel id="rooms" className="scroll-mt-6 space-y-4">
            <SectionTitle icon={<Users />} tone="pink">
              Race your friends
            </SectionTitle>
            <p className="text-sm font-semibold text-stone-300">
              Pick a player name to create or join rooms of up to {MAX_ROOM_PLAYERS} and battle in monthly tournaments.
              No sign-up needed.
            </p>
            <NameForm submitLabel="Let's go" />
            <span id="tournaments" className="block scroll-mt-6" />
          </Panel>
        )
      ) : null}
      <Toast toast={toast} />
    </div>
  );
}

/** Avatar, level, XP bar, streak and trophies: the player's "status" at a glance. */
export function PlayerCard({ name, large = false }: { name: string | null; large?: boolean }) {
  const progress = useProgress();
  const xp = progress?.xp ?? 0;
  const info = levelInfo(xp);
  const streak = progress ? liveStreak(progress, dayKey()) : 0;
  const trophies = progress?.achievements.length ?? 0;
  return (
    <Link
      href="/sudoku/profile"
      className="group animate-rise flex items-center gap-4 rounded-3xl border border-white/10 bg-gradient-to-r from-violet-500/15 via-white/[0.03] to-cyan-500/10 p-4 transition hover:border-cyan-300/40"
    >
      <div className="relative">
        <Avatar name={name ?? "Guest"} className={large ? "size-16 text-xl" : "size-12 text-base"} />
        <span className="absolute -right-1 -bottom-1 rounded-full bg-pink-400 px-1.5 font-display text-[0.7rem] font-bold text-night ring-2 ring-night">
          {info.level}
        </span>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate font-display text-lg font-semibold">
            {name ?? "Guest"} <span className="text-sm font-medium text-cyan-300">· {info.title}</span>
          </p>
          <span className="shrink-0 font-num text-xs font-semibold text-stone-400 tabular-nums">
            {info.into}/{info.span} XP
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-violet-400 to-pink-400 shadow-[0_0_10px_rgb(244_114_182/0.6)] transition-[width] duration-700"
            style={{ width: `${Math.max(3, info.progress * 100)}%` }}
          />
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 font-display text-sm font-bold">
        <span className={`flex items-center gap-1 ${streak ? "text-orange-300" : "text-stone-500"}`} title="Daily streak">
          <Flame className={`size-4 ${streak ? "fill-orange-400" : ""}`} /> {streak}
        </span>
        <span className="flex items-center gap-1 text-yellow-300" title="Achievements">
          <Trophy className="size-4" /> {trophies}/{ACHIEVEMENTS.length}
        </span>
      </div>
    </Link>
  );
}

function DailyHero() {
  const isClient = useIsClient();
  // "Today" depends on the viewer's clock, and the hub is prerendered, so render on the client only.
  if (!isClient) return <section id="play" className="min-h-[17rem] scroll-mt-6 md:min-h-[15rem]" />;
  return <DailyHeroInner />;
}

function DailyHeroInner() {
  const today = dayKey();
  const difficulty = dailyDifficulty(today);
  const done = loadDailyDone() === today;
  const saved = loadSavedGame();
  const weekday = new Date(`${today}T00:00:00Z`).toLocaleDateString("en", { weekday: "long", timeZone: "UTC" });
  const style = DIFFICULTY_STYLE[difficulty];

  return (
    <section id="play" className="grid scroll-mt-6 gap-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="relative overflow-hidden rounded-3xl border-2 border-cyan-300/40 bg-gradient-to-br from-cyan-500/20 via-violet-600/15 to-pink-500/20 p-6">
        <div aria-hidden className="absolute -top-10 -right-10 grid grid-cols-3 gap-2 opacity-20 rotate-12">
          {Array.from({ length: 9 }, (_, k) => (
            <span key={k} className={`size-12 rounded-xl border-4 ${k === 8 ? "border-pink-300 bg-pink-300" : "border-cyan-300"}`} />
          ))}
        </div>
        <p className="flex items-center gap-2 font-display text-sm font-semibold tracking-widest text-pink-200 uppercase">
          <CalendarDays className="size-4" /> Daily puzzle · {weekday}
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold sm:text-5xl">
          Today&apos;s grid is <span className={`${style.text} text-glow-cyan`}>{DIFFICULTY_CONFIG[difficulty].label}</span>
        </h1>
        <p className="mt-2 max-w-sm text-sm font-semibold text-stone-300">
          Same puzzle for everyone. Clear it to keep your streak alive and grab bonus XP.
        </p>
        <div className="mt-5">
          {done ? (
            <span className="inline-flex items-center gap-2 rounded-2xl border-2 border-lime-300/60 bg-lime-400/15 px-5 py-3 font-display font-bold text-lime-200">
              <Check className="size-5" /> Cleared! Back tomorrow
            </span>
          ) : (
            <Link href="/sudoku/play/daily" className={`${buttonStyles.primary} animate-glow-pulse px-8 py-4 text-lg`}>
              <Play className="size-5 fill-night" /> PLAY
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-col justify-between gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        {saved ? (
          <>
            <div>
              <p className="font-display text-sm font-semibold tracking-widest text-stone-400 uppercase">Continue</p>
              <p className="mt-1 font-display text-2xl font-semibold">
                <span className={DIFFICULTY_STYLE[saved.difficulty].text}>{DIFFICULTY_CONFIG[saved.difficulty].label}</span>{" "}
                puzzle
              </p>
              <p className="text-sm font-semibold text-stone-400">
                {formatDuration(saved.elapsedMs)} played · {saved.lives === 0 ? "∞" : `${Math.max(0, saved.lives - saved.livesLost)} ♥`} left
              </p>
            </div>
            <Link href={`/sudoku/play/${saved.difficulty}`} className={`${buttonStyles.secondary} w-full`}>
              Resume <ChevronRight className="size-4" />
            </Link>
          </>
        ) : (
          <>
            <div>
              <p className="font-display text-sm font-semibold tracking-widest text-stone-400 uppercase">Quick play</p>
              <p className="mt-1 font-display text-2xl font-semibold">Jump into a Medium</p>
              <p className="text-sm font-semibold text-stone-400">Beat par ({formatDuration(PAR_MS.medium)}) for a third star.</p>
            </div>
            <Link href="/sudoku/play/medium" className={`${buttonStyles.secondary} w-full`}>
              Quick play <ChevronRight className="size-4" />
            </Link>
          </>
        )}
      </div>
    </section>
  );
}

function SoloSection() {
  const isClient = useIsClient();
  const stats: Partial<Record<Difficulty, SoloStats>> = isClient ? loadStats() : {};
  return (
    <section className="space-y-3">
      <SectionTitle icon={<Star />} tone="gold">
        Pick your level
      </SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {DIFFICULTIES.map((d, k) => {
          const s = stats[d];
          const style = DIFFICULTY_STYLE[d];
          return (
            <Link
              key={d}
              href={`/sudoku/play/${d}`}
              style={{ animationDelay: `${k * 70}ms` }}
              className={`group animate-rise relative overflow-hidden rounded-3xl border-2 bg-gradient-to-b p-4 transition hover:-translate-y-1 ${style.border} ${style.glow} ${style.gradient}`}
            >
              <div className="flex gap-0.5">
                {Array.from({ length: 6 }, (_, i) => (
                  <Star
                    key={i}
                    className={`size-3.5 ${i < style.stars ? `fill-current ${style.text}` : "text-stone-600"}`}
                  />
                ))}
              </div>
              <p className={`mt-2 font-display text-2xl font-bold ${style.text}`}>{DIFFICULTY_CONFIG[d].label}</p>
              <p className="text-xs font-semibold text-stone-300">{DIFFICULTY_CONFIG[d].blurb}</p>
              <div className="mt-4 flex items-center justify-between font-num text-[0.7rem] font-semibold text-stone-400">
                <span>
                  {s?.played ? `🏆 ${s.won}/${s.played}${s.bestMs !== null ? ` · ⚡${formatDuration(s.bestMs)}` : ""}` : "New!"}
                </span>
                <Play className={`size-5 rounded-full p-1 ${style.chip} transition group-hover:scale-125`} />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
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
    <Panel id="rooms" className="scroll-mt-6 space-y-5">
      <SectionTitle icon={<Users />} tone="pink">
        Race your friends
      </SectionTitle>
      <p className="text-sm font-semibold text-stone-300">
        Same puzzle, everyone at once, up to {MAX_ROOM_PLAYERS} players. Watch the live race, not each other&apos;s numbers.
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
              className="w-full accent-pink-400"
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
        <button type="submit" disabled={busy} className={`${buttonStyles.pink} w-full`}>
          <Play className="size-4 fill-night" /> Create room
        </button>
      </form>

      <form
        className="space-y-2 border-t border-white/10 pt-5"
        onSubmit={(e) => {
          e.preventDefault();
          const code = parseInviteCode(joinCode);
          if (code) router.push(`/sudoku/room/${code}`);
        }}
      >
        <Field label="Join a room">
          <div className="flex gap-2">
            <input
              className={`${inputStyles} font-mono tracking-widest uppercase`}
              placeholder="Code or invite link"
              value={joinCode}
              autoCapitalize="characters"
              autoComplete="off"
              onChange={(e) => setJoinCode(e.target.value)}
            />
            <button type="submit" className={buttonStyles.secondary} disabled={!parseInviteCode(joinCode)}>
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
    <Panel id="tournaments" className="scroll-mt-6 space-y-5">
      <SectionTitle icon={<Trophy />} tone="gold">
        Tournaments
      </SectionTitle>
      <p className="text-sm font-semibold text-stone-300">
        Your crew&apos;s private league, whether that&apos;s family or school friends. Every race scores points, and a new
        champion is crowned each month.
      </p>

      {leagues === null ? (
        <p className="text-sm text-stone-500">Loading…</p>
      ) : leagues.length ? (
        <ul className="space-y-2">
          {leagues.map((l) => (
            <li key={l.code}>
              <Link
                href={`/sudoku/league/${l.code}`}
                className="flex items-center justify-between rounded-2xl border border-yellow-300/20 bg-yellow-300/[0.04] px-4 py-3 transition hover:border-yellow-300/60 hover:bg-yellow-300/[0.08]"
              >
                <span className="flex items-center gap-2 font-display font-semibold">
                  <Trophy className="size-4 text-yellow-300" /> {l.name}
                </span>
                <span className="text-xs font-semibold text-stone-400">
                  {l.memberCount} {l.memberCount === 1 ? "member" : "members"} →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm font-semibold text-stone-400">No tournaments yet. Start one for your crew 👇</p>
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
          const code = parseInviteCode(joinCode);
          if (code) router.push(`/sudoku/league/${code}`);
        }}
      >
        <Field label="Join with a code">
          <div className="flex gap-2">
            <input
              className={`${inputStyles} font-mono tracking-widest uppercase`}
              placeholder="Code or invite link"
              value={joinCode}
              autoCapitalize="characters"
              autoComplete="off"
              onChange={(e) => setJoinCode(e.target.value)}
            />
            <button type="submit" className={buttonStyles.secondary} disabled={!parseInviteCode(joinCode)}>
              Open
            </button>
          </div>
        </Field>
      </form>
    </Panel>
  );
}
