"use client";

import { useEffect, useState } from "react";
import { FileDown, ImageDown, Loader2, Printer, Share2 } from "lucide-react";

import { receiptNumber, receiptPdf, receiptPng, type ReceiptView } from "@/lib/receipt/receipt-file";

type Busy = "pdf" | "png" | "share" | null;

function save(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Download the receipt as PDF or picture, share it (WhatsApp, e-mail…) or print it.
 * The files are made on the phone itself. Hidden on paper.
 */
export function ReceiptActions({ receipt, autoPrint }: { receipt: ReceiptView; autoPrint: boolean }): JSX.Element {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const base = `recibo-${receiptNumber(receipt.number)}`;

  useEffect(() => {
    try {
      const probe = new File([new Blob(["x"], { type: "image/png" })], "x.png", { type: "image/png" });
      setCanShare(typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] }));
    } catch {
      setCanShare(false);
    }
  }, []);

  useEffect(() => {
    if (!autoPrint) return;
    const id = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(id);
  }, [autoPrint]);

  const run = async (kind: Exclude<Busy, null>) => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "pdf") save(await receiptPdf(receipt), `${base}.pdf`);
      else if (kind === "png") save(await receiptPng(receipt), `${base}.png`);
      else {
        const file = new File([await receiptPdf(receipt)], `${base}.pdf`, { type: "application/pdf" });
        const shareable = navigator.canShare?.({ files: [file] }) ? file : new File([await receiptPng(receipt)], `${base}.png`, { type: "image/png" });
        await navigator.share({ files: [shareable], title: `Recibo nº ${receiptNumber(receipt.number)}` });
      }
    } catch (failure) {
      // Closing the share sheet is not an error.
      if (!(failure instanceof DOMException && failure.name === "AbortError")) setError(failure instanceof Error ? failure.message : "Não foi possível gerar o arquivo.");
    } finally {
      setBusy(null);
    }
  };

  const button = "inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 text-sm font-semibold disabled:opacity-60";
  const primary = `${button} bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]`;
  const secondary = `${button} border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] text-[hsl(var(--foreground))]`;
  const icon = (kind: Busy, Icon: typeof FileDown) => (busy === kind ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />);

  return (
    <div className="mx-auto mb-4 max-w-[380px] space-y-2 print:hidden">
      <p className="text-sm text-[hsl(var(--foreground-muted))]">Salve o recibo no celular:</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={primary} disabled={busy !== null} onClick={() => void run("pdf")}>{icon("pdf", FileDown)}Baixar PDF</button>
        <button type="button" className={primary} disabled={busy !== null} onClick={() => void run("png")}>{icon("png", ImageDown)}Baixar imagem</button>
        {canShare ? <button type="button" className={secondary} disabled={busy !== null} onClick={() => void run("share")}>{icon("share", Share2)}Compartilhar</button> : null}
        <button type="button" className={`${secondary} ${canShare ? "" : "col-span-2"}`} disabled={busy !== null} onClick={() => window.print()}><Printer className="h-4 w-4" />Imprimir</button>
      </div>
      {error ? <p role="alert" className="text-sm text-[hsl(var(--danger))]">{error}</p> : null}
    </div>
  );
}
