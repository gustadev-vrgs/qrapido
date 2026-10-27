import type { AppTone } from "@/components/ui/app-design-system";
import type { Order, PaymentMethod, Table, TableSession } from "@/lib/types/domain";

export type TableView = "free" | "occupied" | "expired" | "disabled" | "archived";

export const TABLE_VIEW_META: Record<TableView, { label: string; tone: AppTone }> = {
  free: { label: "Livre", tone: "success" },
  occupied: { label: "Ocupada", tone: "primary" },
  expired: { label: "Tempo esgotado", tone: "warning" },
  disabled: { label: "Desativada", tone: "neutral" },
  archived: { label: "Excluída", tone: "neutral" }
};

export function isSessionOver(session: TableSession | undefined, at = Date.now()): boolean {
  return Boolean(session && new Date(session.expiresAt).getTime() <= at);
}

export function tableViewOf(table: Table, session: TableSession | undefined, at = Date.now()): TableView {
  if (table.archivedAt) return "archived";
  if (table.isActive === false) return "disabled";
  if (session) return isSessionOver(session, at) ? "expired" : "occupied";
  // Marked as occupied without a live attendance (older versions): closing it frees the table.
  if (table.status === "active" || table.status === "blocked" || table.status === "awaiting_payment") return "expired";
  return "free";
}

export function formatAccessCode(code: string | null | undefined): string {
  return code && code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : "--- ---";
}

export function timeLeft(session: TableSession, at: number): string {
  const minutes = Math.round((new Date(session.expiresAt).getTime() - at) / 60000);
  if (minutes <= 0) return "tempo esgotado";
  if (minutes < 60) return `${minutes} min restantes`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")} restantes`;
}

export function minutesSince(iso: string | null | undefined, at = Date.now()): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((at - new Date(iso).getTime()) / 60000));
}

export function elapsedLabel(iso: string | null | undefined, at = Date.now()): string {
  const minutes = minutesSince(iso, at);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  return `há ${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}

export interface Bill {
  orders: Order[];
  subtotal: number;
  serviceFee: number;
  total: number;
  /** Payment method most customers of the table chose (pre-selected at the cashier). */
  suggestedMethod: PaymentMethod | null;
  kitchenPending: number;
}

const round = (value: number) => Math.round(value * 100) / 100;

export function buildBill(orders: Order[]): Bill {
  const valid = orders.filter((order) => order.status !== "cancelled");
  const counts = new Map<PaymentMethod, number>();
  valid.forEach((order) => counts.set(order.paymentMethod, (counts.get(order.paymentMethod) ?? 0) + 1));
  const suggestedMethod = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    orders: [...orders].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)),
    subtotal: round(valid.reduce((sum, order) => sum + order.subtotal, 0)),
    serviceFee: round(valid.reduce((sum, order) => sum + (order.serviceFee ?? 0), 0)),
    total: round(valid.reduce((sum, order) => sum + order.total, 0)),
    suggestedMethod,
    kitchenPending: valid.filter((order) => ["received", "confirmed", "in_preparation"].includes(order.status)).length
  };
}
