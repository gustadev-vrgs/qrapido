"use client";

import { useEffect } from "react";

type WakeLockSentinel = { release: () => Promise<void>; released: boolean };

/**
 * Keeps the screen on while the page is open (kitchen and waiter screens).
 * Silently does nothing where the browser does not support it.
 */
export function useWakeLock(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> } };
    if (!nav.wakeLock) return;
    let sentinel: WakeLockSentinel | null = null;
    let alive = true;
    const acquire = () => {
      if (document.visibilityState !== "visible") return;
      nav.wakeLock?.request("screen").then((lock) => { if (alive) sentinel = lock; else void lock.release(); }).catch(() => undefined);
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", acquire);
      void sentinel?.release().catch(() => undefined);
    };
  }, [enabled]);
}
