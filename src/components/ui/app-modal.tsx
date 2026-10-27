"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils/cn";

/** Dialog that becomes a bottom sheet on the phone. Closes on the backdrop and on Esc. */
export function AppModal({ title, onClose, children, size = "md", closeOnBackdrop = true }: { title: string; onClose: () => void; children: ReactNode; size?: "md" | "lg"; /** false for long forms, so a stray tap does not lose what was typed. */ closeOnBackdrop?: boolean }): JSX.Element {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title} onClick={closeOnBackdrop ? onClose : undefined}>
      <div className={cn("max-h-[92vh] w-full space-y-4 overflow-y-auto rounded-t-[22px] bg-[hsl(var(--background-elevated))] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-[var(--radius-lg)] sm:pb-5", size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg")} onClick={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-3">
          <h2 className="text-xl">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="-mr-1 rounded-lg p-1.5 text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--surface-muted))]"><X className="h-5 w-5" /></button>
        </header>
        {children}
      </div>
    </div>
  );
}
