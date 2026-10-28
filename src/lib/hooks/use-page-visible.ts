"use client";

import { useEffect, useState } from "react";

/**
 * False while the tab is hidden (screen off, another app or tab in front).
 * Polling stops meanwhile, which saves the diner's battery and Firestore reads.
 */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}
