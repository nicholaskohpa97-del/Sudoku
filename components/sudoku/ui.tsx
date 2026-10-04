"use client";

import { Check, Copy, Share2, Star, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PEERS } from "@/lib/sudoku/engine";
import { setMuted, useMuted } from "@/lib/sudoku/sfx";

const noopSubscribe = () => () => {};

/** False during SSR/hydration, true afterwards. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/** Re-renders every `intervalMs` while `active`, returning the current time. */
export function useNow(active: boolean, intervalMs = 500): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}

/** Removes digit `value` from the pencil marks of every peer of `index`. */
export function clearPeerNotes(notes: number[], index: number, value: number): number[] {
  const next = notes.slice();
  next[index] = 0;
  for (const p of PEERS[index]) next[p] &= ~(1 << value);
  return next;
}

export type ToastTone = "error" | "success" | "info";

export function useToast() {
  const [toast, setToast] = useState<{ message: string; tone: ToastTone; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((message: string, tone: ToastTone = "info") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, tone, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return { toast, show };
}

export function Toast({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const tone = {
    error: "border-rose-400/60 bg-rose-950/95 text-rose-100 shadow-rose-500/30",
    success: "border-lime-300/60 bg-lime-950/95 text-lime-100 shadow-lime-400/30",
    info: "border-cyan-300/40 bg-night-2/95 text-stone-100 shadow-cyan-400/20",
  };
  return (
    <div aria-live="assertive" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 sm:bottom-8">
      {toast ? (
        <div
          key={toast.id}
          className={`animate-rise rounded-full border-2 px-5 py-2.5 text-sm font-semibold shadow-xl ${tone[toast.tone]}`}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}

export function Panel({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section
      id={id}
      className={`relative rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-5 shadow-[0_0_0_1px_rgb(34_211_238/0.05),0_20px_50px_-20px_rgb(0_0_0/0.8)] backdrop-blur-sm sm:p-6 ${className}`}
    >
      {children}
    </section>
  );
}

/** Section heading with a coloured icon chip. */
export function SectionTitle({
  icon,
  children,
  tone = "cyan",
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  tone?: "cyan" | "pink" | "lime" | "gold";
}) {
  const chip = {
    cyan: "bg-cyan-400/15 text-cyan-300 ring-cyan-300/30",
    pink: "bg-pink-400/15 text-pink-300 ring-pink-300/30",
    lime: "bg-lime-400/15 text-lime-300 ring-lime-300/30",
    gold: "bg-yellow-400/15 text-yellow-300 ring-yellow-300/30",
  }[tone];
  return (
    <h2 className="flex items-center gap-2.5 font-display text-xl font-semibold tracking-wide">
      <span className={`grid size-8 place-items-center rounded-xl ring-1 [&>svg]:size-4.5 ${chip}`}>{icon}</span>
      {children}
    </h2>
  );
}

// Chunky "arcade" buttons: a darker bottom edge that squashes when pressed.
const buttonBase =
  "inline-flex select-none items-center justify-center gap-2 rounded-2xl px-5 py-3 font-display text-[0.95rem] font-semibold tracking-wide transition-all duration-100 active:translate-y-[3px] disabled:pointer-events-none disabled:opacity-40";
export const buttonStyles = {
  primary: `${buttonBase} bg-gradient-to-b from-cyan-300 to-cyan-400 text-night shadow-[0_4px_0_0_#0e7490,0_0_24px_-4px_rgb(34_211_238/0.6)] hover:brightness-110 active:shadow-[0_1px_0_0_#0e7490]`,
  pink: `${buttonBase} bg-gradient-to-b from-pink-300 to-pink-400 text-night shadow-[0_4px_0_0_#9d174d,0_0_24px_-4px_rgb(244_114_182/0.6)] hover:brightness-110 active:shadow-[0_1px_0_0_#9d174d]`,
  secondary: `${buttonBase} border border-white/15 bg-white/[0.07] text-stone-100 shadow-[0_4px_0_0_rgb(255_255_255/0.08)] hover:bg-white/[0.12] active:shadow-[0_1px_0_0_rgb(255_255_255/0.08)]`,
  danger: `${buttonBase} border border-rose-400/40 bg-rose-500/10 text-rose-200 shadow-[0_4px_0_0_rgb(244_63_94/0.25)] hover:bg-rose-500/20 active:shadow-[0_1px_0_0_rgb(244_63_94/0.25)]`,
};

export function BackLink({ href = "/sudoku", label = "Back" }: { href?: string; label?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-semibold text-stone-300 transition hover:border-cyan-300/40 hover:text-cyan-200"
    >
      ← {label}
    </Link>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold tracking-wider text-stone-400 uppercase">{label}</span>
      {children}
    </label>
  );
}

export const inputStyles =
  "w-full rounded-xl border-2 border-white/10 bg-night/60 px-3.5 py-2.5 font-semibold text-stone-100 placeholder:font-normal placeholder:text-stone-500 outline-none transition focus:border-cyan-300/70 focus:shadow-[0_0_0_4px_rgb(34_211_238/0.12)]";

/** The "Last Piece" mark, same artwork as app/icon.svg. */
export function Logo({ className = "size-8" }: { className?: string }) {
  const tiles = [
    [96, 96, 0.35],
    [208, 96, 0.48],
    [320, 96, 0.62],
    [96, 208, 0.48],
    [208, 208, 0.62],
    [320, 208, 0.8],
    [96, 320, 0.62],
    [208, 320, 0.8],
  ];
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden>
      <rect width="512" height="512" rx="112" fill="#1A1240" />
      <g fill="none" stroke="#22D3EE" strokeWidth="14">
        {tiles.map(([x, y, o]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="96" height="96" rx="24" opacity={o} />
        ))}
      </g>
      <rect x="326" y="306" width="96" height="96" rx="24" fill="#F472B6" transform="rotate(8 374 354)" />
    </svg>
  );
}

const AVATAR_GRADIENTS = [
  "from-cyan-400 to-blue-500",
  "from-pink-400 to-fuchsia-500",
  "from-lime-300 to-emerald-500",
  "from-yellow-300 to-orange-500",
  "from-violet-400 to-indigo-500",
  "from-rose-400 to-red-500",
];

function hashString(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

/** Initials in a colourful disc; the colour is stable per player. */
export function Avatar({ name, seed, className = "size-9 text-sm" }: { name: string; seed?: string; className?: string }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?";
  const gradient = AVATAR_GRADIENTS[hashString(seed ?? name) % AVATAR_GRADIENTS.length];
  return (
    <span
      aria-hidden
      className={`inline-grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-display font-bold text-night ring-2 ring-white/20 ${gradient} ${className}`}
    >
      {initials}
    </span>
  );
}

/** 1–3 stars; `animate` pops them in one after another. */
export function Stars({ count, max = 3, animate = false, className = "size-7" }: { count: number; max?: number; animate?: boolean; className?: string }) {
  return (
    <span className="inline-flex items-end gap-1" aria-label={`${count} of ${max} stars`}>
      {Array.from({ length: max }, (_, k) => (
        <Star
          key={k}
          className={`${className} ${k === 1 && max === 3 ? "-translate-y-1.5" : ""} ${
            k < count ? "fill-yellow-300 text-yellow-300 drop-shadow-[0_0_8px_rgb(250_204_21/0.7)]" : "text-stone-600"
          } ${animate && k < count ? "animate-cell-pop" : ""}`}
          style={animate ? { animationDelay: `${250 + k * 220}ms` } : undefined}
        />
      ))}
    </span>
  );
}

export function MuteToggle() {
  const muted = useMuted();
  return (
    <button
      type="button"
      onClick={() => setMuted(!muted)}
      aria-label={muted ? "Turn sound on" : "Turn sound off"}
      aria-pressed={!muted}
      className="grid size-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-stone-300 transition hover:border-cyan-300/40 hover:text-cyan-200"
    >
      {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
    </button>
  );
}

/**
 * Copy-link and native-share buttons for an invite. Copy always works
 * (falls back to a prompt when the clipboard is blocked); Share is offered
 * only where the Web Share API exists, and cancelling it changes nothing.
 */
export function InviteButtons({ path, title, text }: { path: string; title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const isClient = useIsClient();
  const url = isClient ? `${window.location.origin}${path}` : path;
  const canShare = isClient && typeof navigator.share === "function";
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className={buttonStyles.secondary}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {
            prompt("Copy this invite link:", url);
          }
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied!" : "Copy invite link"}
      </button>
      {canShare ? (
        <button
          type="button"
          className={buttonStyles.secondary}
          onClick={() => navigator.share({ title, text, url }).catch(() => {})}
        >
          <Share2 className="size-4" /> Share
        </button>
      ) : null}
    </div>
  );
}
