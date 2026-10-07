"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePlayer } from "@/lib/sudoku/client";
import { clearInbox, getInbox, refreshInbox } from "@/lib/sudoku/inbox";
import type { NotificationView } from "@/lib/sudoku/types";

const POLL_MS = 45_000;
const ANNOUNCED_KEY = "sudoku.inbox.announced";

interface Banner {
  title: string;
  body: string;
  href: string;
  key: number;
}

/**
 * Keeps the inbox fresh while the app is open and announces what's new: the
 * unread alerts when you open the app (once per session), then each new one
 * as it arrives.
 */
export function NotificationWatcher() {
  const { player } = usePlayer();
  const playerId = player?.id ?? null;
  const [banner, setBanner] = useState<Banner | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!playerId) {
      clearInbox();
      return;
    }
    let stopped = false;

    const show = (items: NotificationView[]) => {
      if (!items.length || stopped) return;
      const one = items.length === 1;
      setBanner({
        title: one ? items[0].title : `👑 ${items.length} new alerts`,
        body: one ? items[0].body : items[0].title,
        href: one ? items[0].href : "/sudoku/inbox",
        key: Date.now(),
      });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setBanner(null), 8000);
    };

    void (async () => {
      await refreshInbox();
      if (stopped) return;
      let alreadyToldThisSession = false;
      try {
        alreadyToldThisSession = sessionStorage.getItem(ANNOUNCED_KEY) === playerId;
        sessionStorage.setItem(ANNOUNCED_KEY, playerId);
      } catch {
        // Ignore storage failures.
      }
      if (!alreadyToldThisSession) show(getInbox().items.filter((n) => !n.read));
    })();

    const poll = setInterval(async () => {
      if (document.visibilityState === "visible") show(await refreshInbox());
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(poll);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [playerId]);

  return banner ? (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[80] flex justify-center px-4 pt-[env(safe-area-inset-top)]">
      <Link
        key={banner.key}
        href={banner.href}
        onClick={() => setBanner(null)}
        className="animate-rise pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl border-2 border-yellow-300/60 bg-night-2/95 px-4 py-3 shadow-[0_0_30px_-6px_rgb(250_204_21/0.6)]"
      >
        <span className="min-w-0">
          <span className="block font-display text-sm font-bold text-yellow-100">{banner.title}</span>
          <span className="block text-xs font-semibold text-stone-300">{banner.body}</span>
        </span>
      </Link>
    </div>
  ) : null;
}
