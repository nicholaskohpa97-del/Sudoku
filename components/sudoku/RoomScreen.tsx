"use client";

import { Crown, Flag, LogOut, Play, RotateCcw, Timer, Trophy, Users, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiRequestError, api, formatDuration, post, usePlayer } from "@/lib/sudoku/client";
import { awardRoom, type Award } from "@/lib/sudoku/profile";
import { sfx } from "@/lib/sudoku/sfx";
import { DIFFICULTIES, DIFFICULTY_CONFIG, MAX_MISTAKES } from "@/lib/sudoku/engine";
import { MAX_ROOM_PLAYERS, MIN_ROOM_PLAYERS, type MoveResult, type RoomView } from "@/lib/sudoku/types";
import { Board, type CellState } from "./Board";
import { MistakeMeter, NumberPad, useBoardKeys } from "./Controls";
import { ComboMeter, fireConfetti, useJuice } from "./juice";
import { DIFFICULTY_STYLE } from "./theme";
import { NameGate } from "./NameGate";
import {
  Avatar,
  BackLink,
  buttonStyles,
  clearPeerNotes,
  Field,
  inputStyles,
  InviteButtons,
  Panel,
  Toast,
  useNow,
  useToast,
} from "./ui";

type ShowToast = ReturnType<typeof useToast>["show"];

function without(record: Record<number, number>, key: number): Record<number, number> {
  const next = { ...record };
  delete next[key];
  return next;
}

export function RoomScreen({ code }: { code: string }) {
  return (
    <NameGate title={`Join room ${code}`}>
      <RoomLoader code={code} />
    </NameGate>
  );
}

function RoomLoader({ code }: { code: string }) {
  const { player } = usePlayer();
  const [room, setRoom] = useState<RoomView | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { toast, show } = useToast();
  const latest = useRef(0);

  /** Accept a room snapshot unless a newer one has already arrived. */
  const accept = useCallback((view: RoomView) => {
    if (view.serverNow < latest.current) return;
    latest.current = view.serverNow;
    setOffset(view.serverNow - Date.now());
    setRoom(view);
    setError(null);
  }, []);

  const status = room?.status;
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const view = await api<RoomView>(`/rooms/${code}`);
        if (!cancelled) accept(view);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    };
    poll();
    const id = setInterval(poll, status === "finished" ? 5000 : 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [code, status, accept]);

  if (error && !room) {
    return (
      <Panel className="mx-auto max-w-md space-y-4 text-center">
        <p className="text-stone-200">{error}</p>
        <BackLink label="Back to Sudoku" />
      </Panel>
    );
  }
  if (!room || !player) return <p className="text-center text-stone-400">Loading room…</p>;

  const isMember = room.players.some((p) => p.id === player.id);
  return (
    <>
      {isMember ? (
        <RoomBody room={room} playerId={player.id} offset={offset} accept={accept} show={show} />
      ) : (
        <JoinCard room={room} accept={accept} show={show} />
      )}
      <Toast toast={toast} />
    </>
  );
}

function JoinCard({ room, accept, show }: { room: RoomView; accept: (v: RoomView) => void; show: ShowToast }) {
  const [busy, setBusy] = useState(false);
  const full = room.players.length >= room.maxPlayers;
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <BackLink />
      <Panel className="space-y-4">
        <p className="font-display text-xs font-semibold tracking-[0.3em] text-pink-200 uppercase">You&apos;re invited!</p>
        <h1 className="font-display text-4xl font-bold">
          Room <span className="font-num text-cyan-200 text-glow-cyan">{room.code}</span>
        </h1>
        <p className="text-stone-300">
          {DIFFICULTY_CONFIG[room.difficulty].label} · {room.players.length}/{room.maxPlayers} players
          {room.league ? ` · counts toward ${room.league.name}` : ""}
        </p>
        {room.league ? (
          <p className="text-sm text-stone-400">Joining also adds you to the {room.league.name} monthly tournament.</p>
        ) : null}
        {room.status === "playing" ? (
          <p className="rounded-lg bg-white/5 p-3 text-sm text-stone-300">
            A match is underway. You can join when the host starts the next round.
          </p>
        ) : (
          <button
            type="button"
            disabled={busy || full}
            className={buttonStyles.primary}
            onClick={async () => {
              setBusy(true);
              try {
                accept(await post<RoomView>(`/rooms/${room.code}`, { action: "join" }));
              } catch (err) {
                show((err as Error).message, "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            {full ? "Room is full" : busy ? "Joining…" : "Join the race"}
          </button>
        )}
      </Panel>
      <Leaderboard room={room} playerId={null} />
    </div>
  );
}

function RoomBody(props: {
  room: RoomView;
  playerId: string;
  offset: number;
  accept: (v: RoomView) => void;
  show: ShowToast;
}) {
  const { room, playerId, accept, show } = props;
  const router = useRouter();
  const isHost = room.hostId === playerId;

  const command = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      try {
        const res = await post<RoomView | { left: true }>(`/rooms/${room.code}`, { action, ...extra });
        if ("left" in res) router.push(room.league ? `/sudoku/league/${room.league.code}` : "/sudoku");
        else accept(res);
        return true;
      } catch (err) {
        show((err as Error).message, "error");
        return false;
      }
    },
    [room.code, room.league, router, accept, show],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink href={room.league ? `/sudoku/league/${room.league.code}` : "/sudoku"} label={room.league?.name ?? "Back"} />
        <div className="flex items-center gap-3 text-sm text-stone-400">
          <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 font-num font-bold tracking-widest text-cyan-200">
            {room.code}
          </span>
          <span className={`font-display font-semibold ${DIFFICULTY_STYLE[room.difficulty].text}`}>
            {DIFFICULTY_CONFIG[room.difficulty].label}
          </span>
          {room.round > 0 ? <span>Round {room.round}</span> : null}
        </div>
      </div>

      {room.status === "lobby" ? (
        <Lobby room={room} isHost={isHost} command={command} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-4">
            <MatchBoard key={room.round} {...props} />
            {room.status === "finished" && isHost ? (
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  className={buttonStyles.primary}
                  onClick={async () => {
                    if (await command("lobby")) await command("start");
                  }}
                >
                  <RotateCcw className="size-4" /> Rematch
                </button>
                <button type="button" className={buttonStyles.secondary} onClick={() => command("lobby")}>
                  Back to lobby
                </button>
              </div>
            ) : null}
            {room.status === "finished" && !isHost ? (
              <p className="text-center text-sm text-stone-400">Waiting for the host to start another round…</p>
            ) : null}
          </div>
          <aside className="space-y-4">
            <Leaderboard room={room} playerId={playerId} />
            {room.status === "playing" && isHost ? (
              <button
                type="button"
                className={`${buttonStyles.secondary} w-full`}
                onClick={() => {
                  if (confirm("End the match for everyone now? Unfinished players are ranked by progress.")) command("end");
                }}
              >
                <Flag className="size-4" /> End match now
              </button>
            ) : null}
            <button
              type="button"
              className={`${buttonStyles.danger} w-full`}
              onClick={() => {
                const msg =
                  room.status === "playing"
                    ? "Leave now? This counts as a forfeit for this match."
                    : "Leave this room?";
                if (confirm(msg)) command("leave");
              }}
            >
              <LogOut className="size-4" /> Leave room
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}

function Lobby({
  room,
  isHost,
  command,
}: {
  room: RoomView;
  isHost: boolean;
  command: (action: string, extra?: Record<string, unknown>) => Promise<boolean>;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Panel className="space-y-5">
        <div>
          <p className="font-display text-xs font-semibold tracking-[0.3em] text-pink-200 uppercase">Room code</p>
          <p className="font-num text-5xl font-bold tracking-[0.25em] text-cyan-200 text-glow-cyan">{room.code}</p>
          <p className="mt-2 text-sm font-semibold text-stone-300">
            Send the link, or have friends type the code under <em>Join a room</em>.
            {room.league ? ` Matches here count toward the ${room.league.name} monthly tournament.` : ""}
          </p>
        </div>
        <InviteButtons path={`/sudoku/room/${room.code}`} title={`Sudoku room ${room.code}`} text={`Join my Sudoku room ${room.code}`} />

        {isHost ? (
          <div className="grid gap-4 border-t border-white/10 pt-5 sm:grid-cols-2">
            <Field label="Difficulty">
              <select
                className={inputStyles}
                value={room.difficulty}
                onChange={(e) => command("settings", { difficulty: e.target.value })}
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {DIFFICULTY_CONFIG[d].label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Max players: ${room.maxPlayers}`}>
              <input
                type="range"
                min={Math.max(MIN_ROOM_PLAYERS, room.players.length)}
                max={MAX_ROOM_PLAYERS}
                value={room.maxPlayers}
                onChange={(e) => command("settings", { maxPlayers: Number(e.target.value) })}
                className="w-full accent-pink-400"
              />
            </Field>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-5">
          {isHost ? (
            <button type="button" className={`${buttonStyles.primary} animate-glow-pulse`} onClick={() => command("start")}>
              <Play className="size-4 fill-night" /> Start race
            </button>
          ) : (
            <p className="animate-pulse text-sm font-semibold text-stone-300">Waiting for the host to start the race…</p>
          )}
          <button
            type="button"
            className={buttonStyles.danger}
            onClick={() => {
              if (confirm("Leave this room?")) command("leave");
            }}
          >
            <LogOut className="size-4" /> Leave
          </button>
        </div>
        {isHost && room.league && room.players.length < MIN_ROOM_PLAYERS ? (
          <p className="text-xs text-stone-500">
            Tournament points are only awarded when at least {MIN_ROOM_PLAYERS} players take part.
          </p>
        ) : null}
      </Panel>
      <Leaderboard room={room} playerId={null} />
    </div>
  );
}

function MatchBoard({
  room,
  playerId,
  offset,
  accept,
  show,
}: {
  room: RoomView;
  playerId: string;
  offset: number;
  accept: (v: RoomView) => void;
  show: ShowToast;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [notesMode, setNotesMode] = useState(false);
  const [notes, setNotes] = useState<number[]>(() => new Array(81).fill(0));
  const [wrong, setWrong] = useState<Record<number, number>>({});
  const [flash, setFlash] = useState<{ index: number; key: number } | null>(null);
  const pending = useRef(new Set<number>());
  const juice = useJuice((text) => show(text, "success"));

  const now = useNow(true, 250) + offset;
  const me = room.me;
  const countdown = room.status === "playing" && room.startedAt !== null && now < room.startedAt;
  const canPlay =
    room.status === "playing" && !countdown && !!room.puzzle && !!me && !me.eliminated && me.finishedMs === null;

  const cells: CellState[] = useMemo(() => {
    const board = room.status === "finished" && room.solution ? room.solution : (me?.board ?? "0".repeat(81));
    return Array.from({ length: 81 }, (_, i) => {
      const given = room.puzzle ? room.puzzle[i] !== "0" : false;
      const solvedValue = me ? Number(me.board[i]) : 0;
      const finished = room.status === "finished";
      // After the match, show the full solution; your misses appear dimmed red.
      const value = finished ? Number(board[i]) : solvedValue || wrong[i] || 0;
      return {
        value: room.puzzle ? value : 0,
        given,
        wrong: finished ? !given && solvedValue === 0 : !solvedValue && !!wrong[i],
        notes: solvedValue || finished ? 0 : notes[i],
      };
    });
  }, [room.status, room.solution, room.puzzle, me, wrong, notes]);

  const enter = useCallback(
    async (n: number) => {
      if (!canPlay || selected === null || !me) return;
      const i = selected;
      if (room.puzzle![i] !== "0" || me.board[i] !== "0" || pending.current.has(i)) return;
      if (notesMode) {
        setWrong((w) => without(w, i));
        sfx.tap();
        setNotes((prev) => {
          const next = prev.slice();
          next[i] ^= 1 << n;
          return next;
        });
        return;
      }
      pending.current.add(i);
      try {
        const res = await post<MoveResult>(`/rooms/${room.code}`, { action: "move", index: i, value: n });
        accept(res.room);
        if (res.correct) {
          setWrong((w) => without(w, i));
          setNotes((prev) => clearPeerNotes(prev, i, n));
          // The room's board for me holds only correct digits, exactly what unit detection needs.
          const board = res.room.me?.board;
          if (board) juice.correct(board, i);
          if (res.finishedMs !== null) {
            juice.celebrate(i, "FINISHED!");
            show(`Finished in ${formatDuration(res.finishedMs)}! 🎉`, "success");
          }
        } else {
          setWrong((w) => ({ ...w, [i]: n }));
          setFlash({ index: i, key: Date.now() });
          juice.wrong();
          if (res.eliminated) sfx.lose();
          show(
            res.eliminated
              ? `${n} is wrong. Out of lives for this round!`
              : `Not ${n}! ${MAX_MISTAKES - res.mistakes} ${MAX_MISTAKES - res.mistakes === 1 ? "life" : "lives"} left`,
            "error",
          );
        }
      } catch (err) {
        show(err instanceof ApiRequestError ? err.message : "Connection problem — try again", "error");
      } finally {
        pending.current.delete(i);
      }
    },
    [canPlay, selected, me, room.puzzle, room.code, notesMode, accept, show, juice],
  );

  const erase = useCallback(() => {
    if (selected === null || !canPlay) return;
    setWrong((w) => without(w, selected));
    setNotes((prev) => {
      const next = prev.slice();
      next[selected] = 0;
      return next;
    });
  }, [selected, canPlay]);

  const toggleNotes = useCallback(() => setNotesMode((m) => !m), []);
  useBoardKeys({ enabled: canPlay, selected, setSelected, onNumber: enter, onErase: erase, onToggleNotes: toggleNotes });

  // Countdown beeps, then "GO!".
  const countdownSecs = countdown ? Math.ceil((room.startedAt! - now) / 1000) : 0;
  const sinceStart = room.startedAt !== null ? now - room.startedAt : -1;
  const showGo = room.status === "playing" && sinceStart >= 0 && sinceStart < 900;
  const lastBeep = useRef<number | null>(null);
  useEffect(() => {
    const beat = countdown ? countdownSecs : showGo ? 0 : null;
    if (beat === null || beat === lastBeep.current) return;
    lastBeep.current = beat;
    if (beat === 0) sfx.go();
    else sfx.tick();
  }, [countdown, countdownSecs, showGo]);

  // XP and confetti once the round is over.
  const myRank = room.players.find((p) => p.id === playerId);
  const [award, setAward] = useState<Award | null>(null);
  useEffect(() => {
    if (room.status !== "finished" || !myRank) return;
    const won = myRank.rank === 1 && myRank.finishedMs !== null;
    const result = awardRoom(`${room.code}:${room.round}`, { won, finished: myRank.finishedMs !== null });
    if (!result) return;
    juice.announce(result.unlocked);
    if (won) {
      sfx.win();
      fireConfetti(true);
    }
    // One-off award for this finished round; keep it to show the XP gained.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAward(result);
  }, [room.status, room.code, room.round, myRank, juice]);

  let overlay: React.ReactNode = null;
  if (countdown) {
    overlay = (
      <div className="text-center">
        <p className="font-display text-sm font-semibold tracking-[0.3em] text-pink-200 uppercase">Get ready</p>
        <p key={countdownSecs} className="animate-zoom-in font-display text-9xl font-bold text-cyan-200 text-glow-cyan">
          {countdownSecs}
        </p>
      </div>
    );
  } else if (room.status === "playing" && me?.eliminated) {
    overlay = (
      <div className="space-y-2 px-6 text-center">
        <p className="text-5xl">💔</p>
        <h2 className="font-display text-3xl font-bold text-rose-300">Out of lives</h2>
        <p className="text-sm font-semibold text-stone-300">Watch the race to see who takes the crown.</p>
      </div>
    );
  } else if (room.status === "playing" && me?.finishedMs != null) {
    overlay = (
      <div className="space-y-2 px-6 text-center">
        <Trophy className="mx-auto size-12 text-yellow-300 drop-shadow-[0_0_12px_rgb(250_204_21/0.8)]" />
        <h2 className="font-display text-3xl font-bold text-lime-200">Finished in {formatDuration(me.finishedMs)}</h2>
        <p className="text-sm font-semibold text-stone-300">You&apos;re #{myRank?.rank} right now. Waiting for the others…</p>
      </div>
    );
  }

  const remaining = room.endsAt !== null ? room.endsAt - now : 0;
  const elapsed = room.startedAt !== null ? Math.max(0, now - room.startedAt) : 0;

  return (
    <div className="space-y-4">
      {room.status === "finished" ? <Results room={room} playerId={playerId} award={award} /> : null}
      <div className="mx-auto grid w-full max-w-[min(92vw,30rem)] grid-cols-3 items-center text-sm">
        <MistakeMeter mistakes={me?.mistakes ?? 0} />
        <div className="flex justify-center">
          <ComboMeter combo={juice.combo} />
        </div>
        {room.status === "playing" ? (
          <span
            className={`flex items-center justify-end gap-1.5 font-num font-semibold tabular-nums ${remaining < 60_000 ? "animate-pulse text-rose-300" : "text-stone-100"}`}
            title={`Elapsed ${formatDuration(elapsed)}`}
          >
            <Timer className="size-4 text-cyan-300" /> {formatDuration(remaining)}
          </span>
        ) : (
          <span className="text-right text-xs font-semibold text-stone-400">Solution shown</span>
        )}
      </div>
      <div className="relative">
        <Board
          cells={cells}
          selected={canPlay ? selected : null}
          onSelect={setSelected}
          flash={flash}
          effects={juice.effects}
          overlay={overlay}
        />
        {showGo ? (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
            <span className="animate-zoom-in font-display text-9xl font-bold text-lime-200 [text-shadow:0_0_30px_rgb(163_230_53/0.9)]">
              GO!
            </span>
          </div>
        ) : null}
      </div>
      {room.status === "playing" ? (
        <NumberPad
          cells={cells}
          notesMode={notesMode}
          disabled={!canPlay}
          onNumber={enter}
          onErase={erase}
          onToggleNotes={toggleNotes}
        />
      ) : null}
    </div>
  );
}

function Results({ room, playerId, award }: { room: RoomView; playerId: string; award: Award | null }) {
  const winner = room.players.find((p) => p.rank === 1 && p.finishedMs !== null);
  const me = room.players.find((p) => p.id === playerId);
  const podium = room.players.filter((p) => p.rank <= 3).slice(0, 3);
  // Display order 2nd, 1st, 3rd so the winner stands in the middle.
  const order = [podium[1], podium[0], podium[2]].filter(Boolean) as typeof podium;
  const height = { 1: "h-24", 2: "h-16", 3: "h-12" } as Record<number, string>;
  const medal = { 1: "from-yellow-300 to-amber-500", 2: "from-stone-200 to-stone-400", 3: "from-orange-300 to-orange-600" } as Record<number, string>;
  return (
    <Panel className="animate-rise space-y-4 text-center">
      <h2 className="animate-zoom-in font-display text-4xl font-bold text-yellow-200 text-glow-gold">
        {winner ? (winner.id === playerId ? "You won! 👑" : `${winner.name} wins!`) : "Nobody finished"}
      </h2>
      <div className="flex items-end justify-center gap-3">
        {order.map((p) => (
          <div key={p.id} className="flex w-24 flex-col items-center gap-1.5">
            <Avatar name={p.name} seed={p.id} className={p.rank === 1 ? "size-14 text-lg" : "size-11 text-sm"} />
            <p className="w-full truncate font-display text-sm font-semibold">{p.id === playerId ? "You" : p.name}</p>
            <div
              className={`flex w-full items-start justify-center rounded-t-xl bg-gradient-to-b pt-1 font-display text-2xl font-bold text-night ${height[p.rank] ?? "h-10"} ${medal[p.rank] ?? "from-stone-500 to-stone-600"}`}
            >
              {p.rank}
            </div>
          </div>
        ))}
      </div>
      {me ? (
        <p className="text-sm font-semibold text-stone-300">
          You placed #{me.rank} of {room.players.length}
          {me.points !== null ? ` · +${me.points} tournament points` : ""}
          {award ? ` · +${award.xp} XP` : ""}
        </p>
      ) : null}
    </Panel>
  );
}

function Leaderboard({ room, playerId }: { room: RoomView; playerId: string | null }) {
  const live = room.status !== "lobby";
  return (
    <Panel className="space-y-3 self-start !p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display font-semibold text-stone-100">
          <Users className="size-4" /> {live ? (room.status === "finished" ? "Final standings" : "Live standings") : "Players"}
        </h3>
        <span className="text-xs text-stone-500">
          {room.players.length}/{room.maxPlayers}
        </span>
      </div>
      <ol className="space-y-2">
        {room.players.map((p) => {
          const pct = room.toFill ? Math.round((p.filled / room.toFill) * 100) : 0;
          return (
            <li
              key={p.id}
              className={`rounded-2xl border px-3 py-2.5 ${p.id === playerId ? "border-cyan-300/50 bg-cyan-300/[0.07]" : "border-white/5 bg-white/[0.03]"}`}
            >
              <div className="flex items-center gap-2 text-sm">
                {live ? <span className="w-5 font-display font-bold text-stone-400 tabular-nums">{p.rank}</span> : null}
                <Avatar name={p.name} seed={p.id} className="size-7 text-[0.65rem]" />
                <span className="min-w-0 flex-1 truncate font-semibold text-stone-100">
                  {p.name}
                  {p.id === playerId ? <span className="text-stone-500"> (you)</span> : null}
                </span>
                {p.isHost ? <Crown className="size-4 fill-yellow-300 text-yellow-300" aria-label="Host" /> : null}
                {p.online ? (
                  <Wifi className="size-3.5 text-lime-300" aria-label="Online" />
                ) : (
                  <WifiOff className="size-3.5 text-stone-600" aria-label="Offline" />
                )}
              </div>
              {live ? (
                <>
                  <div className="relative mt-2 h-2.5 rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${p.eliminated ? "bg-stone-600" : p.finishedMs !== null ? "bg-gradient-to-r from-lime-400 to-lime-300 shadow-[0_0_10px_rgb(163_230_53/0.7)]" : p.id === playerId ? "bg-gradient-to-r from-cyan-400 to-pink-400 shadow-[0_0_10px_rgb(34_211_238/0.7)]" : "bg-gradient-to-r from-violet-400 to-cyan-400"}`}
                      style={{ width: `${pct}%` }}
                    />
                    <span
                      aria-hidden
                      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm transition-all duration-700"
                      style={{ left: `${Math.min(97, Math.max(3, pct))}%` }}
                    >
                      {p.finishedMs !== null ? "🏁" : p.eliminated ? "💥" : "🚀"}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between text-[0.7rem] text-stone-500">
                    <span>
                      {p.finishedMs !== null
                        ? `Done · ${formatDuration(p.finishedMs)}`
                        : p.eliminated
                          ? "Out (3 mistakes)"
                          : `${pct}%`}
                    </span>
                    <span>
                      {p.mistakes}/{MAX_MISTAKES} mistakes{p.points !== null ? ` · +${p.points} pts` : ""}
                    </span>
                  </div>
                </>
              ) : null}
            </li>
          );
        })}
      </ol>
      {room.league ? (
        <Link href={`/sudoku/league/${room.league.code}`} className="block text-xs text-stone-400 hover:text-stone-200">
          Tournament: {room.league.name} →
        </Link>
      ) : null}
    </Panel>
  );
}
