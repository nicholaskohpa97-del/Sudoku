"use client";

import { Crown, Flag, LogOut, Play, RotateCcw, Timer, Trophy, Users, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiRequestError, api, formatDuration, post, usePlayer } from "@/lib/sudoku/client";
import { DIFFICULTIES, DIFFICULTY_CONFIG, MAX_MISTAKES } from "@/lib/sudoku/engine";
import { MAX_ROOM_PLAYERS, MIN_ROOM_PLAYERS, type MoveResult, type RoomView } from "@/lib/sudoku/types";
import { Board, type CellState } from "./Board";
import { MistakeMeter, NumberPad, useBoardKeys } from "./Controls";
import { NameGate } from "./NameGate";
import { BackLink, buttonStyles, clearPeerNotes, Field, inputStyles, InviteButtons, Panel, Toast, useNow, useToast } from "./ui";

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
        <p className="text-xs tracking-widest text-stone-400 uppercase">You&apos;re invited</p>
        <h1 className="font-display text-4xl">Room {room.code}</h1>
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
            {full ? "Room is full" : busy ? "Joining…" : "Join room"}
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
          <span className="rounded-md border border-white/10 px-2 py-0.5 font-mono tracking-widest text-stone-200">
            {room.code}
          </span>
          <span>{DIFFICULTY_CONFIG[room.difficulty].label}</span>
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
          <p className="text-xs tracking-widest text-stone-400 uppercase">Invite code</p>
          <p className="font-mono text-5xl tracking-[0.25em] text-amber-200">{room.code}</p>
          <p className="mt-2 text-sm text-stone-400">
            Friends can open the link, or enter the code under <em>Join a room</em>.
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
                className="w-full accent-amber-300"
              />
            </Field>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-5">
          {isHost ? (
            <button type="button" className={buttonStyles.primary} onClick={() => command("start")}>
              <Play className="size-4" /> Start match
            </button>
          ) : (
            <p className="text-sm text-stone-400">Waiting for the host to start…</p>
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
          if (res.finishedMs !== null) show(`Finished in ${formatDuration(res.finishedMs)}! 🎉`, "success");
        } else {
          setWrong((w) => ({ ...w, [i]: n }));
          setFlash({ index: i, key: Date.now() });
          show(
            res.eliminated
              ? `${n} is wrong — ${MAX_MISTAKES} mistakes, you're out of this round.`
              : `${n} doesn't go there — mistake ${res.mistakes} of ${MAX_MISTAKES}`,
            "error",
          );
        }
      } catch (err) {
        show(err instanceof ApiRequestError ? err.message : "Connection problem — try again", "error");
      } finally {
        pending.current.delete(i);
      }
    },
    [canPlay, selected, me, room.puzzle, room.code, notesMode, accept, show],
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

  const myRank = room.players.find((p) => p.id === playerId);
  let overlay: React.ReactNode = null;
  if (countdown) {
    overlay = (
      <div className="text-center">
        <p className="text-sm tracking-widest text-stone-400 uppercase">Get ready</p>
        <p className="font-display text-8xl text-amber-200">{Math.ceil((room.startedAt! - now) / 1000)}</p>
      </div>
    );
  } else if (room.status === "playing" && me?.eliminated) {
    overlay = (
      <div className="space-y-2 px-6 text-center">
        <h2 className="font-display text-3xl">Out of mistakes</h2>
        <p className="text-sm text-stone-300">You made {MAX_MISTAKES} mistakes. Watch the leaderboard to see who wins.</p>
      </div>
    );
  } else if (room.status === "playing" && me?.finishedMs != null) {
    overlay = (
      <div className="space-y-2 px-6 text-center">
        <Trophy className="mx-auto size-10 text-amber-300" />
        <h2 className="font-display text-3xl">Finished in {formatDuration(me.finishedMs)}</h2>
        <p className="text-sm text-stone-300">Currently #{myRank?.rank}. Waiting for the others…</p>
      </div>
    );
  }

  const remaining = room.endsAt !== null ? room.endsAt - now : 0;
  const elapsed = room.startedAt !== null ? Math.max(0, now - room.startedAt) : 0;

  return (
    <div className="space-y-4">
      {room.status === "finished" ? <Results room={room} playerId={playerId} /> : null}
      <div className="mx-auto flex w-full max-w-[min(92vw,30rem)] items-center justify-between text-sm">
        <MistakeMeter mistakes={me?.mistakes ?? 0} />
        {room.status === "playing" ? (
          <span
            className={`flex items-center gap-1.5 tabular-nums ${remaining < 60_000 ? "text-rose-300" : "text-stone-300"}`}
            title={`Elapsed ${formatDuration(elapsed)}`}
          >
            <Timer className="size-4" /> {formatDuration(remaining)} left
          </span>
        ) : (
          <span className="text-stone-400">Solution shown</span>
        )}
      </div>
      <Board cells={cells} selected={canPlay ? selected : null} onSelect={setSelected} flash={flash} overlay={overlay} />
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

function Results({ room, playerId }: { room: RoomView; playerId: string }) {
  const winner = room.players.find((p) => p.finishedMs !== null);
  const me = room.players.find((p) => p.id === playerId);
  return (
    <Panel className="space-y-1 text-center">
      <Trophy className="mx-auto size-8 text-amber-300" />
      <h2 className="font-display text-3xl">
        {winner ? (winner.id === playerId ? "You won!" : `${winner.name} wins`) : "Nobody finished"}
      </h2>
      {me ? (
        <p className="text-sm text-stone-300">
          You placed #{me.rank} of {room.players.length}
          {me.points !== null ? ` · +${me.points} tournament points` : ""}
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
        <h3 className="flex items-center gap-2 text-sm font-medium text-stone-200">
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
              className={`rounded-lg border px-3 py-2 ${p.id === playerId ? "border-amber-300/40 bg-amber-300/[0.06]" : "border-white/5 bg-white/[0.02]"}`}
            >
              <div className="flex items-center gap-2 text-sm">
                {live ? <span className="w-5 text-stone-500 tabular-nums">{p.rank}</span> : null}
                <span className="min-w-0 flex-1 truncate text-stone-100">
                  {p.name}
                  {p.id === playerId ? <span className="text-stone-500"> (you)</span> : null}
                </span>
                {p.isHost ? <Crown className="size-3.5 text-amber-300" aria-label="Host" /> : null}
                {p.online ? (
                  <Wifi className="size-3.5 text-emerald-400" aria-label="Online" />
                ) : (
                  <WifiOff className="size-3.5 text-stone-600" aria-label="Offline" />
                )}
              </div>
              {live ? (
                <>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full transition-all ${p.eliminated ? "bg-stone-600" : p.finishedMs !== null ? "bg-emerald-400" : "bg-sky-400"}`}
                      style={{ width: `${pct}%` }}
                    />
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
