import "server-only";

import crypto from "node:crypto";

type Doc = Record<string, any>;

export interface ReceiptLine { name: string; options: string; quantity: number; unitPrice: number; total: number }

export interface ReceiptDoc {
  restaurantId: string;
  number: number;
  sessionId: string;
  tableId: string;
  tableNumber: number;
  tableLabel: string;
  openedAt: string | null;
  closedAt: string;
  lines: ReceiptLine[];
  subtotal: number;
  serviceFee: number;
  total: number;
  payments: Array<{ method: string; amount: number }>;
  courtesy: boolean;
  issuer: { name: string; legalName: string | null; document: string | null; address: string | null; phone: string | null };
  closedByName: string | null;
  publicToken: string;
  createdAt: string;
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Same dish with the same options and price becomes one line (2x PF de frango...). Cancelled orders stay out. */
export function receiptLines(orders: Doc[]): { lines: ReceiptLine[]; subtotal: number; serviceFee: number; total: number } {
  const valid = orders.filter((order) => order.status !== "cancelled");
  const lines = new Map<string, ReceiptLine>();
  for (const order of valid) {
    for (const item of Array.isArray(order.items) ? order.items : []) {
      const options = (Array.isArray(item.options) ? item.options : []).map((option: Doc) => String(option.name ?? "")).filter(Boolean).join(", ");
      const unitPrice = round(Number(item.priceSnapshot ?? 0));
      const key = `${item.nameSnapshot}|${options}|${unitPrice}`;
      const line = lines.get(key) ?? { name: String(item.nameSnapshot ?? "Item"), options, quantity: 0, unitPrice, total: 0 };
      line.quantity += Number(item.quantity ?? 0);
      line.total = round(line.total + Number(item.total ?? unitPrice * Number(item.quantity ?? 0)));
      lines.set(key, line);
    }
  }
  return {
    lines: [...lines.values()],
    subtotal: round(valid.reduce((sum, order) => sum + Number(order.subtotal ?? 0), 0)),
    serviceFee: round(valid.reduce((sum, order) => sum + Number(order.serviceFee ?? 0), 0)),
    total: round(valid.reduce((sum, order) => sum + Number(order.total ?? 0), 0))
  };
}

export function newReceiptToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function tokenMatches(expected: unknown, given: unknown): boolean {
  if (typeof expected !== "string" || typeof given !== "string" || expected.length !== given.length || !/^[a-f0-9]{32}$/.test(given)) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

export function receiptPath(id: string, token: string): string {
  return `/recibo/${encodeURIComponent(id)}?t=${token}`;
}
