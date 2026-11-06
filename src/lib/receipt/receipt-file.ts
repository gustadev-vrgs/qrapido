/**
 * Turns a receipt (comprovante de consumo) into a picture or a PDF in the customer's
 * own browser: nothing is uploaded and no library is needed. The PDF is one page as
 * wide as thermal paper (80 mm) with the picture inside, like the printed slip.
 */

export interface ReceiptView {
  number: number;
  tableLabel: string;
  openedAt: string | null;
  closedAt: string;
  lines: Array<{ name: string; options: string; quantity: number; unitPrice: number; total: number }>;
  subtotal: number;
  serviceFee: number;
  total: number;
  payments: Array<{ method: string; amount: number }>;
  courtesy: boolean;
  issuer: { name: string; legalName: string | null; document: string | null; address: string | null; phone: string | null };
  closedByName: string | null;
  openedByName?: string | null;
}

export const PAYMENT_NAMES: Record<string, string> = { pix: "Pix", cash: "Dinheiro", debit_card: "Cartão de débito", credit_card: "Cartão de crédito", card_on_counter: "Cartão no caixa", card_on_table: "Cartão na mesa" };

const TIME_ZONE = process.env.NEXT_PUBLIC_RESTAURANT_TIME_ZONE || "America/Sao_Paulo";
export const brl = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
export const receiptWhen = (iso: string | null) => (iso ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE }).format(new Date(iso)) : "—");
export const receiptNumber = (value: number) => String(value).padStart(6, "0");

const WIDTH = 384; // CSS pixels, about 80 mm
const PAD = 20;
const SCALE = 2; // sharp on phone screens and when printed

type Op =
  | { kind: "text"; text: string; y: number; align: "left" | "center" | "right"; font: string; x?: number }
  | { kind: "rule"; y: number; dashed: boolean; width: number }
  | { kind: "box"; y: number; height: number };

const FONT = (size: number, bold = false) => `${bold ? "700" : "400"} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !current) current = next;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

/** Lays the receipt out once (to know the height), then draws it. */
function layout(ctx: CanvasRenderingContext2D, receipt: ReceiptView): { ops: Op[]; height: number } {
  const ops: Op[] = [];
  const inner = WIDTH - PAD * 2;
  let y = PAD;
  const center = (text: string, size: number, bold = false, maxWidth = inner) => {
    ctx.font = FONT(size, bold);
    for (const line of wrap(ctx, text, maxWidth)) { y += size + 4; ops.push({ kind: "text", text: line, y, align: "center", font: FONT(size, bold) }); }
  };
  const left = (text: string, size = 13, bold = false) => {
    ctx.font = FONT(size, bold);
    for (const line of wrap(ctx, text, inner)) { y += size + 5; ops.push({ kind: "text", text: line, y, align: "left", font: FONT(size, bold) }); }
  };
  const pair = (label: string, value: string, size = 13, bold = false) => {
    y += size + 6;
    ops.push({ kind: "text", text: label, y, align: "left", font: FONT(size, bold) });
    ops.push({ kind: "text", text: value, y, align: "right", font: FONT(size, bold) });
  };
  const rule = (dashed: boolean, width = 1) => { y += 9; ops.push({ kind: "rule", y, dashed, width }); y += 3; };

  center(receipt.issuer.name.toUpperCase(), 16, true);
  if (receipt.issuer.legalName) center(receipt.issuer.legalName, 12);
  if (receipt.issuer.document) center(`CNPJ/CPF ${receipt.issuer.document}`, 12);
  if (receipt.issuer.address) center(receipt.issuer.address, 12);
  if (receipt.issuer.phone) center(`Tel. ${receipt.issuer.phone}`, 12);
  rule(false, 2);
  center(`COMPROVANTE DE CONSUMO Nº ${receiptNumber(receipt.number)}`, 14, true);
  rule(false, 2);
  left(receipt.tableLabel, 15, true);
  left(`Aberta ${receiptWhen(receipt.openedAt)}  ·  Fechada ${receiptWhen(receipt.closedAt)}`, 12);
  if (receipt.openedByName) left(`Atendimento: ${receipt.openedByName}`, 12);
  if (receipt.closedByName) left(`Caixa: ${receipt.closedByName}`, 12);
  rule(true);

  for (const line of receipt.lines) {
    ctx.font = FONT(13, true);
    const nameLines = wrap(ctx, `${line.quantity}x ${line.name}`, inner - 90);
    nameLines.forEach((text, index) => {
      y += 18;
      ops.push({ kind: "text", text, y, align: "left", font: FONT(13, true) });
      if (index === 0) ops.push({ kind: "text", text: brl(line.total), y, align: "right", font: FONT(13, true) });
    });
    if (line.options) { ctx.font = FONT(11); for (const text of wrap(ctx, line.options, inner - 12)) { y += 15; ops.push({ kind: "text", text, y, align: "left", x: PAD + 12, font: FONT(11) }); } }
    y += 15;
    ops.push({ kind: "text", text: `un. ${brl(line.unitPrice)}`, y, align: "left", x: PAD + 12, font: FONT(11) });
  }
  rule(true);
  pair("Subtotal", brl(receipt.subtotal));
  if (receipt.serviceFee) pair("Taxa de serviço", brl(receipt.serviceFee));
  pair("TOTAL", brl(receipt.total), 17, true);
  rule(true);
  if (receipt.courtesy) left("Cortesia do restaurante (sem cobrança)", 13, true);
  else for (const payment of receipt.payments) pair(PAYMENT_NAMES[payment.method] ?? payment.method, brl(payment.amount));

  y += 14;
  const boxTop = y;
  y += 4;
  center("NÃO É DOCUMENTO FISCAL", 13, true, inner - 24);
  center("Comprovante de consumo emitido pelo QRápido. Para nota fiscal, solicite ao estabelecimento.", 11, false, inner - 24);
  y += 8;
  ops.push({ kind: "box", y: boxTop, height: y - boxTop });
  y += 6;
  center("Obrigado e volte sempre!", 12);
  return { ops, height: Math.ceil(y + PAD) };
}

/** Draws the receipt on a white canvas (black text, like the thermal slip). */
export function drawReceipt(receipt: ReceiptView): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const measure = canvas.getContext("2d");
  if (!measure) throw new Error("Este navegador não consegue gerar a imagem.");
  const { ops, height } = layout(measure, receipt);
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.fillStyle = "#000000";
  ctx.strokeStyle = "#000000";
  ctx.textBaseline = "alphabetic";
  for (const op of ops) {
    if (op.kind === "text") {
      ctx.font = op.font;
      ctx.textAlign = op.align;
      const x = op.x ?? (op.align === "center" ? WIDTH / 2 : op.align === "right" ? WIDTH - PAD : PAD);
      ctx.fillText(op.text, x, op.y);
    } else if (op.kind === "rule") {
      ctx.lineWidth = op.width;
      ctx.setLineDash(op.dashed ? [4, 3] : []);
      ctx.beginPath(); ctx.moveTo(PAD, op.y); ctx.lineTo(WIDTH - PAD, op.y); ctx.stroke();
    } else {
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(PAD, op.y, WIDTH - PAD * 2, op.height);
    }
  }
  return canvas;
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível gerar o arquivo."))), type, quality));
}

export async function receiptPng(receipt: ReceiptView): Promise<Blob> {
  return canvasBlob(drawReceipt(receipt), "image/png");
}

/** Minimal one-page PDF that shows a JPEG (DCTDecode): valid in every PDF viewer. */
export function jpegPdf(jpeg: Uint8Array, widthPx: number, heightPx: number): Blob {
  const pageWidth = 226.77; // 80 mm in points
  const pageHeight = Math.round((pageWidth * heightPx / widthPx) * 100) / 100;
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: string | Uint8Array) => { const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk; parts.push(bytes); length += bytes.length; };
  const object = (id: number, body: string) => { offsets[id] = length; push(`${id} 0 obj\n${body}\nendobj\n`); };

  push("%PDF-1.4\n%âãÏÓ\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = length;
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  push(jpeg);
  push("\nendstream\nendobj\n");
  const content = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`;
  object(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = length;
  push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((id) => `${String(offsets[id]).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: "application/pdf" });
}

export async function receiptPdf(receipt: ReceiptView): Promise<Blob> {
  const canvas = drawReceipt(receipt);
  const jpeg = new Uint8Array(await (await canvasBlob(canvas, "image/jpeg", 0.92)).arrayBuffer());
  return jpegPdf(jpeg, canvas.width, canvas.height);
}
