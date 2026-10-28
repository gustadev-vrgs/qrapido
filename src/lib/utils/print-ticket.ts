import type { Order } from "@/lib/types/domain";

const escapeHtml = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

/** Kitchen ticket laid out for 58/80 mm thermal printers (large table number, items, notes). */
export function orderTicketHtml(order: Order, restaurantName?: string | null): string {
  const time = new Date(order.receivedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const items = order.items.map((item) => {
    const options = item.options?.length ? `<div class="opt">${item.options.map((option) => escapeHtml(option.name)).join(" · ")}</div>` : "";
    const notes = item.notes ? `<div class="note">&gt; ${escapeHtml(item.notes)}</div>` : "";
    return `<li><b>${escapeHtml(item.quantity)}x</b> ${escapeHtml(item.nameSnapshot)}${options}${notes}</li>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Comanda Mesa ${escapeHtml(order.tableNumber)}</title><style>
@page{size:80mm auto;margin:3mm}
body{font-family:ui-monospace,Menlo,Consolas,monospace;margin:0;width:72mm;color:#000}
h1{font-size:26pt;margin:0 0 1mm}
.meta{font-size:10pt;margin:0 0 2mm}
ul{list-style:none;padding:0;margin:2mm 0;border-top:1px dashed #000;border-bottom:1px dashed #000}
li{font-size:14pt;padding:1.5mm 0}
.opt{font-size:11pt;margin-left:6mm}
.note{font-size:12pt;font-weight:bold;margin-left:6mm}
.alert{font-size:12pt;font-weight:bold;border:2px solid #000;padding:1.5mm;margin-top:2mm}
.foot{font-size:9pt;margin-top:2mm}
</style></head><body>
<h1>MESA ${escapeHtml(order.tableNumber)}</h1>
<p class="meta">${escapeHtml(order.orderCode ?? "")} · ${escapeHtml(time)}${order.customerName ? ` · ${escapeHtml(order.customerName)}` : ""}</p>
<ul>${items}</ul>
${order.notes ? `<div class="alert">ATENÇÃO: ${escapeHtml(order.notes)}</div>` : ""}
<p class="foot">${escapeHtml(restaurantName ?? "QRápido")}</p>
</body></html>`;
}

let queue: Promise<void> = Promise.resolve();

/**
 * Prints through a hidden iframe. Calls are queued: browsers ignore a second print()
 * while a print dialog is open. For printing without the dialog, open the kitchen
 * screen in Chrome with --kiosk-printing.
 */
export function printOrderTicket(order: Order, restaurantName?: string | null): Promise<void> {
  queue = queue.then(() => new Promise<void>((resolve) => {
    const frame = document.createElement("iframe");
    Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) { frame.remove(); resolve(); return; }
    doc.open();
    doc.write(orderTicketHtml(order, restaurantName));
    doc.close();
    window.setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => { frame.remove(); resolve(); }, 1000);
    }, 50);
  }));
  return queue;
}
