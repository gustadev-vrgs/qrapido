import type { Metadata } from "next";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { brl, PAYMENT_NAMES, receiptNumber, receiptWhen as when, type ReceiptView } from "@/lib/receipt/receipt-file";
import { tokenMatches, type ReceiptDoc } from "@/lib/server/receipts";

import { ReceiptActions } from "./receipt-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Recibo · QRápido", robots: { index: false, follow: false } };

/** What the browser gets to draw the PDF/picture: the receipt without its secret token. */
function toView(receipt: ReceiptDoc): ReceiptView {
  return {
    number: receipt.number, tableLabel: receipt.tableLabel, openedAt: receipt.openedAt, closedAt: receipt.closedAt,
    lines: receipt.lines, subtotal: receipt.subtotal, serviceFee: receipt.serviceFee, total: receipt.total,
    payments: receipt.payments, courtesy: receipt.courtesy, issuer: receipt.issuer,
    closedByName: receipt.closedByName ?? null, openedByName: receipt.openedByName ?? null
  };
}

async function loadReceipt(id: string, token: string | undefined): Promise<ReceiptDoc | null> {
  if (!id || id.length > 128 || id.includes("/")) return null;
  try {
    const snap = await (getAdminFirestore() as any).collection("receipts").doc(id).get();
    if (!snap.exists) return null;
    const data = snap.data() as ReceiptDoc;
    // The link carries a secret token: receipt numbers alone cannot be enumerated.
    return tokenMatches(data.publicToken, token) ? data : null;
  } catch {
    return null;
  }
}

/** Non-fiscal receipt of one table (comprovante), readable by whoever has the link; printable on 80 mm or A4. */
export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ receiptId: string }>; searchParams: Promise<{ t?: string; print?: string }> }): Promise<JSX.Element> {
  const { receiptId } = await params;
  const { t, print } = await searchParams;
  const receipt = await loadReceipt(receiptId, t);

  if (!receipt) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[hsl(var(--background))] p-4">
        <div className="app-surface-strong max-w-sm p-6 text-center">
          <h1 className="text-xl">Recibo não encontrado</h1>
          <p className="mt-2 text-sm text-[hsl(var(--foreground-muted))]">O link está incompleto ou o recibo foi apagado. Peça ao caixa para mostrar o recibo de novo.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[hsl(var(--background))] px-3 py-6 print:bg-white print:p-0">
      <ReceiptActions receipt={toView(receipt)} autoPrint={print === "1"} />
      <article className="receipt mx-auto w-full max-w-[380px] bg-white p-5 text-[13px] leading-snug text-black shadow-[0_10px_30px_-18px_rgba(0,0,0,0.5)] print:max-w-none print:p-0 print:shadow-none">
        <div className="text-center">
          <p className="text-base font-bold uppercase">{receipt.issuer.name}</p>
          {receipt.issuer.legalName ? <p>{receipt.issuer.legalName}</p> : null}
          {receipt.issuer.document ? <p>CNPJ/CPF {receipt.issuer.document}</p> : null}
          {receipt.issuer.address ? <p>{receipt.issuer.address}</p> : null}
          {receipt.issuer.phone ? <p>Tel. {receipt.issuer.phone}</p> : null}
        </div>
        <div className="my-3 border-y-2 border-black py-1.5 text-center font-bold">COMPROVANTE DE CONSUMO Nº {receiptNumber(receipt.number)}</div>
        <p className="text-base font-bold">{receipt.tableLabel}</p>
        <p>Aberta {when(receipt.openedAt)} · fechada {when(receipt.closedAt)}</p>
        {receipt.openedByName ? <p>Atendimento: {receipt.openedByName}</p> : null}
        {receipt.closedByName ? <p>Caixa: {receipt.closedByName}</p> : null}

        <table className="mt-3 w-full border-t border-dashed border-black">
          <thead><tr className="text-left"><th className="py-1 font-semibold">Item</th><th className="py-1 text-right font-semibold">Qtd</th><th className="py-1 text-right font-semibold">Valor</th></tr></thead>
          <tbody>
            {receipt.lines.map((line, index) => (
              <tr key={index} className="align-top">
                <td className="py-0.5 pr-2">{line.name}{line.options ? <span className="block text-[11px]">{line.options}</span> : null}<span className="block text-[11px]">un. {brl(line.unitPrice)}</span></td>
                <td className="py-0.5 text-right">{line.quantity}</td>
                <td className="py-0.5 text-right">{brl(line.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-2 space-y-0.5 border-t border-dashed border-black pt-2">
          <p className="flex justify-between"><span>Subtotal</span><span>{brl(receipt.subtotal)}</span></p>
          {receipt.serviceFee ? <p className="flex justify-between"><span>Taxa de serviço</span><span>{brl(receipt.serviceFee)}</span></p> : null}
          <p className="flex justify-between text-base font-bold"><span>TOTAL</span><span>{brl(receipt.total)}</span></p>
        </div>
        <div className="mt-2 space-y-0.5 border-t border-dashed border-black pt-2">
          {receipt.courtesy ? <p className="font-semibold">Cortesia do restaurante (sem cobrança)</p> : receipt.payments.map((payment, index) => <p key={index} className="flex justify-between"><span>{PAYMENT_NAMES[payment.method] ?? payment.method}</span><span>{brl(payment.amount)}</span></p>)}
        </div>

        <p className="mt-4 border-2 border-black p-2 text-center text-[12px] font-bold">NÃO É DOCUMENTO FISCAL<span className="block font-normal">Comprovante de consumo emitido pelo QRápido. Para nota fiscal, solicite ao estabelecimento.</span></p>
        <p className="mt-2 text-center text-[11px]">Obrigado e volte sempre!</p>
      </article>
    </main>
  );
}
