"use client";

import { Volume2 } from "lucide-react";

import { playChime, unlockAudio, useAudioReady } from "@/lib/audio/chime";

/**
 * Browsers only play sound after someone taps the page. On a kitchen tablet that just
 * opened the panel, orders would arrive in silence: this banner asks for that first tap.
 */
export function SoundUnlockNotice({ enabled }: { enabled: boolean }): JSX.Element | null {
  const ready = useAudioReady();
  if (!enabled || ready) return null;
  return (
    <button
      type="button"
      onClick={() => { unlockAudio(); playChime("order"); }}
      className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-[hsl(var(--warning)/0.5)] bg-[hsl(var(--warning)/0.12)] p-3 text-left text-sm font-semibold"
    >
      <Volume2 className="h-5 w-5 shrink-0 text-[hsl(var(--warning))]" aria-hidden="true" />
      Toque aqui para ativar o som dos avisos. O navegador só toca som depois de um toque na tela.
    </button>
  );
}
