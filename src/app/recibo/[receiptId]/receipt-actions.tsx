"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";

/** "Imprimir / salvar em PDF" (the browser's print dialog has "Salvar como PDF"); hidden on paper. */
export function ReceiptActions({ autoPrint }: { autoPrint: boolean }): JSX.Element {
  useEffect(() => {
    if (!autoPrint) return;
    const id = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(id);
  }, [autoPrint]);
  return (
    <div className="mx-auto mb-4 flex max-w-[380px] justify-end print:hidden">
      <button type="button" onClick={() => window.print()} className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] bg-[hsl(var(--primary))] px-4 text-sm font-semibold text-[hsl(var(--primary-foreground))]"><Printer className="h-4 w-4" />Imprimir ou salvar PDF</button>
    </div>
  );
}
