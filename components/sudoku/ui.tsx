"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PEERS } from "@/lib/sudoku/engine";

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
    error: "border-rose-400/40 bg-rose-950/90 text-rose-100",
    success: "border-emerald-400/40 bg-emerald-950/90 text-emerald-100",
    info: "border-white/15 bg-slate-900/95 text-stone-100",
  };
  return (
    <div aria-live="assertive" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      {toast ? (
        <div key={toast.id} className={`rounded-full border px-4 py-2 text-sm shadow-xl ${tone[toast.tone]}`}>
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6 ${className}`}>
      {children}
    </section>
  );
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40";
export const buttonStyles = {
  primary: `${buttonBase} bg-amber-300 text-slate-950 hover:bg-amber-200`,
  secondary: `${buttonBase} border border-white/15 bg-white/[0.05] text-stone-100 hover:bg-white/10`,
  danger: `${buttonBase} border border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20`,
};

export function BackLink({ href = "/sudoku", label = "Back" }: { href?: string; label?: string }) {
  return (
    <Link href={href} className="text-sm text-stone-400 transition hover:text-stone-100">
      ← {label}
    </Link>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs tracking-wide text-stone-400 uppercase">{label}</span>
      {children}
    </label>
  );
}

export const inputStyles =
  "w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2.5 text-stone-100 placeholder:text-stone-500 outline-none focus:border-amber-300/70";
