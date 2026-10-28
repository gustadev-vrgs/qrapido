import type { Order, PaymentMethod, TableSession } from "@/lib/types/domain";

const METHODS: PaymentMethod[] = ["pix", "cash", "debit_card", "credit_card"];
const round = (value: number): number => Math.round(value * 100) / 100;

export interface CashClosing {
  dateKey: string;
  /** Money received at the cashier per method, from the bills closed that day. */
  received: Array<{ method: PaymentMethod; amount: number; bills: number }>;
  receivedTotal: number;
  closedBills: number;
  splitBills: number;
  /** Closed without charge (courtesy, table opened by mistake) although it had orders. */
  courtesies: Array<{ tableNumber: number; total: number; reason: string | null }>;
  /** Tables still open with orders not paid yet. */
  openBills: Array<{ tableNumber: number; total: number }>;
  openTotal: number;
  /** Orders of the day (not cancelled) and what they add up to. */
  validOrders: number;
  ordersTotal: number;
  cancelled: Array<{ orderCode: string; tableNumber: number; total: number; reason: string | null }>;
  cancelledTotal: number;
}

/** Payments of a closed bill; bills closed before the split feature only have paidWith + billTotal. */
export function sessionPayments(session: Pick<TableSession, "payments" | "paidWith" | "billTotal">): Array<{ method: PaymentMethod; amount: number }> {
  if (session.payments && session.payments.length) return session.payments;
  if (session.paidWith && session.billTotal) return [{ method: session.paidWith, amount: session.billTotal }];
  return [];
}

/**
 * Cashier summary for one restaurant day. `sessions` are the attendances closed that day
 * plus the ones the day's orders belong to; `orders` are the day's orders.
 */
export function buildCashClosing(dateKey: string, orders: Order[], sessions: TableSession[], closedOn: (session: TableSession) => boolean): CashClosing {
  const received = new Map<PaymentMethod, { amount: number; bills: number }>();
  const courtesies: CashClosing["courtesies"] = [];
  let closedBills = 0;
  let splitBills = 0;

  for (const session of sessions) {
    if (session.status !== "closed" || !closedOn(session)) continue;
    const payments = sessionPayments(session);
    closedBills += 1;
    if (payments.length > 1) splitBills += 1;
    if (!payments.length && (session.billTotal ?? 0) > 0) courtesies.push({ tableNumber: session.tableNumber, total: session.billTotal ?? 0, reason: session.closeReason ?? null });
    for (const payment of payments) {
      const current = received.get(payment.method) ?? { amount: 0, bills: 0 };
      current.amount = round(current.amount + payment.amount);
      current.bills += 1;
      received.set(payment.method, current);
    }
  }

  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  const openByTable = new Map<number, number>();
  for (const order of orders) {
    if (order.status === "cancelled") continue;
    const session = sessionsById.get(order.sessionId);
    if (session && session.status === "closed") continue;
    if (order.paidWith) continue;
    openByTable.set(order.tableNumber, round((openByTable.get(order.tableNumber) ?? 0) + order.total));
  }

  const valid = orders.filter((order) => order.status !== "cancelled");
  const cancelled = orders
    .filter((order) => order.status === "cancelled")
    .map((order) => ({ orderCode: order.orderCode ?? `#${order.id.slice(-6).toUpperCase()}`, tableNumber: order.tableNumber, total: order.total, reason: order.cancellationReason ?? null }));
  const receivedList = METHODS.filter((method) => received.has(method)).map((method) => ({ method, ...received.get(method)! }));
  const openBills = [...openByTable.entries()].sort((a, b) => a[0] - b[0]).map(([tableNumber, total]) => ({ tableNumber, total }));

  return {
    dateKey,
    received: receivedList,
    receivedTotal: round(receivedList.reduce((sum, item) => sum + item.amount, 0)),
    closedBills,
    splitBills,
    courtesies,
    openBills,
    openTotal: round(openBills.reduce((sum, item) => sum + item.total, 0)),
    validOrders: valid.length,
    ordersTotal: round(valid.reduce((sum, order) => sum + order.total, 0)),
    cancelled,
    cancelledTotal: round(cancelled.reduce((sum, item) => sum + item.total, 0))
  };
}
