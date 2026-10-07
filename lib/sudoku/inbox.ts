"use client";

// The player's inbox: dethroned alerts and beaten scores. Polled while the app
// is open (no push infrastructure needed), shared by the menu badge, the inbox
// page and the "you've been dethroned" toast.
import { useSyncExternalStore } from "react";
import { api, post } from "./client";
import type { NotificationView } from "./types";

interface InboxState {
  items: NotificationView[];
  unread: number;
  loaded: boolean;
}

let state: InboxState = { items: [], unread: 0, loaded: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

function set(next: { items: NotificationView[]; unread: number }) {
  state = { ...next, loaded: true };
  emit();
}

export const getInbox = (): InboxState => state;

export const useInbox = (): InboxState => useSyncExternalStore(subscribe, () => state, () => state);

/**
 * Fetches the inbox. Returns the unread items that weren't there on the
 * previous fetch (nothing on the very first fetch, which the caller handles).
 */
export async function refreshInbox(): Promise<NotificationView[]> {
  try {
    const wasLoaded = state.loaded;
    const known = new Set(state.items.map((n) => n.id));
    const next = await api<{ items: NotificationView[]; unread: number }>("/notifications");
    set(next);
    return wasLoaded ? next.items.filter((n) => !n.read && !known.has(n.id)) : [];
  } catch {
    return [];
  }
}

export async function markAllRead(): Promise<void> {
  try {
    set(await post<{ items: NotificationView[]; unread: number }>("/notifications", { all: true }));
  } catch {
    // Offline: the badge will catch up next time.
  }
}

export function clearInbox(): void {
  state = { items: [], unread: 0, loaded: false };
  emit();
}
