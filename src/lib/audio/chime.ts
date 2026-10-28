"use client";

import { useEffect, useState } from "react";

const CHIMES = {
  /** New order for the kitchen: two rising notes. */
  order: [880, 1320],
  /** Something ready to take to a table: three quick notes. */
  ready: [988, 1319, 1568],
  /** Customer called the waiter: low-high-low, distinct from orders. */
  call: [660, 990, 660]
} as const;

export type ChimeKind = keyof typeof CHIMES;

/**
 * One AudioContext for the whole page. Safari (iPad/iPhone) keeps a context created
 * outside a tap suspended forever, so a new context per chime never made a sound there.
 * The context is created and resumed inside the first tap, then reused.
 */
let sharedContext: AudioContext | null = null;
const listeners = new Set<() => void>();

function contextClass(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null;
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

function getContext(): AudioContext | null {
  if (sharedContext) return sharedContext;
  const AudioContextClass = contextClass();
  if (!AudioContextClass) return null;
  try {
    sharedContext = new AudioContextClass();
    sharedContext.addEventListener?.("statechange", notify);
  } catch {
    sharedContext = null;
  }
  return sharedContext;
}

/** Call from a tap or key press: creates/resumes the shared context. */
export function unlockAudio(): void {
  const context = getContext();
  if (!context) return;
  if (context.state === "suspended") {
    void context.resume().then(notify, () => undefined);
  }
  // A silent buffer played inside the gesture fully unlocks older iOS versions.
  try {
    const buffer = context.createBuffer(1, 1, 22050);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start(0);
  } catch {
    /* not needed on current browsers */
  }
  notify();
}

if (typeof window !== "undefined") {
  const onGesture = () => {
    unlockAudio();
    if (sharedContext?.state === "running") {
      window.removeEventListener("pointerdown", onGesture, true);
      window.removeEventListener("keydown", onGesture, true);
    }
  };
  window.addEventListener("pointerdown", onGesture, true);
  window.addEventListener("keydown", onGesture, true);
}

export function isAudioReady(): boolean {
  return sharedContext?.state === "running";
}

/** Short chime generated with Web Audio (no asset needed). */
export function playChime(kind: ChimeKind = "order"): void {
  try {
    const context = getContext();
    if (!context) return;
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    CHIMES[kind].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      gain.connect(context.destination);
      const start = context.currentTime + index * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      oscillator.start(start);
      oscillator.stop(start + 0.17);
    });
  } catch {
    /* sound is a convenience only */
  }
}

/** True once the browser lets the page play sound (after the first tap). */
export function useAudioReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const update = () => setReady(isAudioReady());
    update();
    listeners.add(update);
    return () => { listeners.delete(update); };
  }, []);
  return ready;
}
