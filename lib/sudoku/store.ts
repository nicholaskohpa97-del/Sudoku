"use client";

// Tiny localStorage-backed store with a React hook, shared by chain, history
// and preferences. Reads never throw (private windows, blocked storage).
import { useMemo, useSyncExternalStore } from "react";

export function createStore<T>(key: string, fallback: () => T, eventName: string) {
  const raw = (): string => {
    try {
      return localStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  };
  const parse = (r: string): T => {
    if (!r) return fallback();
    try {
      return { ...fallback(), ...JSON.parse(r) } as T;
    } catch {
      return fallback();
    }
  };
  const subscribe = (onChange: () => void) => {
    window.addEventListener(eventName, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(eventName, onChange);
      window.removeEventListener("storage", onChange);
    };
  };
  return {
    load: (): T => parse(raw()),
    save(value: T) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Ignore storage failures.
      }
      window.dispatchEvent(new Event(eventName));
    },
    /** The stored value; `null` during SSR and hydration. */
    use(): T | null {
      const r = useSyncExternalStore(subscribe, raw, () => null);
      return useMemo(() => (r === null ? null : parse(r)), [r]);
    },
  };
}
