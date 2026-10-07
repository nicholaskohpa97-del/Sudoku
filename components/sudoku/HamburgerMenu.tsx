"use client";

import { Bell, Gamepad2, History, Link2, Menu, Mountain, Settings, Trophy, User, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { usePlayer } from "@/lib/sudoku/client";
import { useHistory } from "@/lib/sudoku/history";
import { useInbox } from "@/lib/sudoku/inbox";
import { useProgress } from "@/lib/sudoku/profile";
import { levelInfo } from "@/lib/sudoku/progress";
import { useChain } from "@/lib/sudoku/session";
import { Avatar } from "./ui";

type Item = { href: string; label: string; hint: string; icon: typeof Menu; badge?: string | number };

/** The app menu: game modes, history, profile and settings. */
export function HamburgerMenu() {
  const pathname = usePathname();
  // Open only for the page it was opened on, so navigating always closes it.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const close = () => setOpenAt(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { player } = usePlayer();
  const progress = useProgress();
  const history = useHistory();
  const chain = useChain();
  const inbox = useInbox();
  const level = levelInfo(progress?.xp ?? 0);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenAt(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const modes: Item[] = [
    { href: "/sudoku#play", label: "Single player", hint: "Six levels and the daily puzzle", icon: Gamepad2 },
    { href: "/sudoku#rooms", label: "Multiplayer", hint: "Race friends in rooms and tournaments", icon: Users },
    { href: "/sudoku/ascent", label: "Ascent", hint: "Increasing difficulty: one climb, one pool of lives", icon: Mountain },
  ];
  const you: Item[] = [
    { href: "/sudoku/leaderboard", label: "Leaderboard", hint: "Post scores, challenge others, take the crown", icon: Trophy },
    { href: "/sudoku/inbox", label: "Inbox", hint: "Who took your crown or beat your score", icon: Bell, badge: inbox.unread || undefined },
    { href: "/sudoku/history", label: "Game history", hint: "Every game you've played", icon: History, badge: history?.records.length || undefined },
    { href: "/sudoku/profile", label: "Profile", hint: "Level, achievements, techniques", icon: User },
    { href: "/sudoku/settings", label: "Settings", hint: "Lives, sound, display", icon: Settings },
  ];

  const row = ({ href, label, hint, icon: Icon, badge }: Item) => (
    <li key={href}>
      <Link
        href={href}
        onClick={close}
        className="flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-white/[0.07] focus-visible:bg-white/[0.07]"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-cyan-200">
          <Icon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base font-semibold text-stone-100">{label}</span>
          <span className="block truncate text-xs font-semibold text-stone-400">{hint}</span>
        </span>
        {badge ? <span className="rounded-full bg-white/10 px-2 py-0.5 font-num text-xs font-bold text-stone-200">{badge}</span> : null}
      </Link>
    </li>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpenAt(pathname)}
        aria-label="Open menu"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative grid size-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-stone-300 transition hover:border-cyan-300/40 hover:text-cyan-200"
      >
        <Menu className="size-4" />
        {inbox.unread > 0 ? (
          <span className="absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-pink-400 px-1 font-num text-[0.6rem] font-bold text-night ring-2 ring-night">
            {inbox.unread > 9 ? "9+" : inbox.unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" onClick={close} className="absolute inset-0 bg-night/70 backdrop-blur-sm" />
          <nav className="animate-rise absolute inset-y-0 right-0 flex w-[min(22rem,88vw)] flex-col gap-4 overflow-y-auto border-l border-white/10 bg-night-2/95 p-4 pt-[max(1rem,env(safe-area-inset-top))] shadow-2xl">
            <div className="flex items-center gap-3">
              <Avatar name={player?.name ?? "Guest"} className="size-11 text-base" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-lg font-semibold text-stone-100">{player?.name ?? "Guest"}</p>
                <p className="text-xs font-semibold text-cyan-300">
                  Lv {level.level} · {level.title}
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                aria-label="Close menu"
                className="grid size-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-stone-300 hover:text-cyan-200"
              >
                <X className="size-4" />
              </button>
            </div>

            {chain && (chain.count > 0 || chain.points > 0) ? (
              <p className="flex items-center justify-between rounded-2xl border border-yellow-300/25 bg-yellow-300/[0.07] px-3 py-2 text-xs font-bold text-yellow-200">
                <span className="flex items-center gap-1">
                  <Link2 className="size-3.5" /> Clear chain {chain.count}
                </span>
                <span className="font-num">Session {chain.points.toLocaleString("en-US")} pts</span>
              </p>
            ) : null}

            <section aria-labelledby="menu-modes">
              <h2 id="menu-modes" className="px-3 pb-1 font-display text-[0.7rem] font-semibold tracking-widest text-stone-500 uppercase">
                Modes
              </h2>
              <ul>{modes.map(row)}</ul>
            </section>
            <section aria-labelledby="menu-you">
              <h2 id="menu-you" className="px-3 pb-1 font-display text-[0.7rem] font-semibold tracking-widest text-stone-500 uppercase">
                You
              </h2>
              <ul>{you.map(row)}</ul>
            </section>
          </nav>
        </div>
      ) : null}
    </>
  );
}
