"use client";

import { useEffect, useState } from "react";

const SOUND_KEY = "qrapido-sound-enabled";

/** Per-device sound preference for the operation screens (on by default). */
export function useSoundSetting(): [boolean, () => void] {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    try { setEnabled(window.localStorage.getItem(SOUND_KEY) !== "off"); } catch { /* storage unavailable */ }
  }, []);
  const toggle = () => {
    setEnabled((current) => {
      const next = !current;
      try { window.localStorage.setItem(SOUND_KEY, next ? "on" : "off"); } catch { /* ignore */ }
      return next;
    });
  };
  return [enabled, toggle];
}
