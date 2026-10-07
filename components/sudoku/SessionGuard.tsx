"use client";

import { useEffect } from "react";
import { AWAY_EVENT, breakChain, isReload, startNewSession } from "@/lib/sudoku/session";

/**
 * Enforces the "one session" rule for the clear chain and the combo.
 * - A fresh load of the app (anything but a refresh) starts a new session.
 * - Coming back after switching to another app or tab breaks both.
 * A refresh does neither: the game and its chain resume exactly where they were.
 */
export function SessionGuard() {
  useEffect(() => {
    if (!isReload()) startNewSession();

    let away = false;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        away = true;
      } else if (away) {
        away = false;
        breakChain("away");
        window.dispatchEvent(new Event(AWAY_EVENT));
      }
    };
    // Restored from the back/forward cache: the page was away, so that counts too.
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        breakChain("away");
        window.dispatchEvent(new Event(AWAY_EVENT));
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onShow);
    };
  }, []);
  return null;
}
