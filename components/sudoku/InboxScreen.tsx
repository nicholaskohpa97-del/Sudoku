"use client";

import { Bell, Crown, Swords } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { markAllRead, refreshInbox, useInbox } from "@/lib/sudoku/inbox";
import { BackLink, SectionTitle } from "./ui";

function when(at: number): string {
  const mins = Math.max(0, Math.round((Date.now() - at) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(at).toLocaleDateString("en-SG", { day: "numeric", month: "short" });
}

/** Dethroned alerts and beaten scores. Opening it marks everything read after a moment. */
export function InboxScreen() {
  const inbox = useInbox();

  useEffect(() => {
    void refreshInbox();
    const id = setTimeout(() => void markAllRead(), 2500);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="space-y-5">
      <BackLink />
      <SectionTitle icon={<Bell />} tone="gold">
        Inbox
      </SectionTitle>
      {!inbox.loaded ? (
        <p className="text-center text-sm font-semibold text-stone-500">Loading…</p>
      ) : inbox.items.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center text-sm font-semibold text-stone-400">
          Nothing yet. When someone takes your crown or beats your score, you&apos;ll hear about it here.
        </p>
      ) : (
        <ul className="space-y-2">
          {inbox.items.map((n) => (
            <li key={n.id}>
              <Link
                href={n.href}
                className={`flex items-start gap-3 rounded-2xl border p-3 transition hover:bg-white/[0.07] ${n.read ? "border-white/10 bg-white/[0.03]" : "border-yellow-300/50 bg-yellow-300/[0.08]"}`}
              >
                <span className="mt-0.5 text-yellow-300">{n.kind === "beaten" ? <Swords className="size-5" /> : <Crown className="size-5" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-sm font-bold text-stone-100">{n.title}</span>
                  <span className="block text-xs font-semibold text-stone-300">{n.body}</span>
                  <span className="mt-1 block text-[0.65rem] font-semibold text-stone-500">{when(n.at)}</span>
                </span>
                {!n.read ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-yellow-300" aria-label="Unread" /> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
