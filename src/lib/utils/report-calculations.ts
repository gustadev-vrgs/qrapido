import type { MenuCategory, MenuItem, Order, OrderEvent, PaymentMethod, TableSession } from "@/lib/types/domain";

export type PeriodPreset = "today" | "yesterday" | "last7" | "last30" | "currentMonth" | "previousMonth" | "custom";
export type RevenueBucket = "hour" | "day" | "month";

export interface ReportPeriod { preset: PeriodPreset; start: Date; end: Date }
export interface Comparison { direction: "up" | "down" | "neutral" | "unknown"; absolute: number; percent: number | null; label: string }
export interface SummaryMetrics { revenue: number; validOrders: number; averageTicket: number; soldItems: number; attendances: number; usedTables: number; cancelledOrders: number; cancellationRate: number; totalOrders: number }
export interface ProductMetric { key: string; name: string; category: string; quantity: number; revenue: number; share: number }
export interface CategoryMetric { name: string; quantity: number; revenue: number; share: number }
export interface PaymentMetric { method: PaymentMethod | "other"; orders: number; total: number; share: number; pending: number; confirmed: number; cancelled: number }
export interface TableMetric { tableId: string; tableNumber: number; attendances: number; orders: number; revenue: number; averageTicket: number; averageDurationMinutes: number; openSessions: number; waiterCalls: number }
export interface SessionMetric { session: TableSession; orders: number; total: number; durationMinutes: number | null; waiterCalls: number }

export const BILLABLE_ORDER_STATUSES = ["delivered"] as const;
export const CANCELLED_ORDER_STATUS = "cancelled";

const dayMs = 24 * 60 * 60 * 1000;

export function startOfDay(date: Date): Date { const next = new Date(date); next.setHours(0, 0, 0, 0); return next; }
export function endOfDay(date: Date): Date { const next = new Date(date); next.setHours(23, 59, 59, 999); return next; }
export function toDateKey(date: Date): string { return date.toISOString().slice(0, 10); }
export function isBillableOrder(order: Pick<Order, "status">): boolean { return BILLABLE_ORDER_STATUSES.includes(order.status as "delivered"); }
export function isCancelledOrder(order: Pick<Order, "status">): boolean { return order.status === CANCELLED_ORDER_STATUS; }
export function safePercent(part: number, total: number): number { return total > 0 ? (part / total) * 100 : 0; }
export function calculateAverageTicket(revenue: number, validOrders: number): number { return validOrders > 0 ? revenue / validOrders : 0; }
export function getOrderDate(order: Pick<Order, "receivedAt" | "createdAt">): Date { return new Date(order.receivedAt || order.createdAt); }
export function filterOrdersByPeriod(orders: Order[], period: Pick<ReportPeriod, "start" | "end">): Order[] { return orders.filter((order) => { const date = getOrderDate(order).getTime(); return date >= period.start.getTime() && date <= period.end.getTime(); }); }
export function filterSessionsByPeriod(sessions: TableSession[], period: Pick<ReportPeriod, "start" | "end">): TableSession[] { return sessions.filter((session) => { const date = new Date(session.startedAt).getTime(); return date >= period.start.getTime() && date <= period.end.getTime(); }); }

export function resolveReportPeriod(preset: PeriodPreset, customStart?: string, customEnd?: string, reference = new Date()): ReportPeriod {
  const today = startOfDay(reference);
  if (preset === "yesterday") { const y = new Date(today.getTime() - dayMs); return { preset, start: y, end: endOfDay(y) }; }
  if (preset === "last7") return { preset, start: startOfDay(new Date(today.getTime() - 6 * dayMs)), end: endOfDay(reference) };
  if (preset === "last30") return { preset, start: startOfDay(new Date(today.getTime() - 29 * dayMs)), end: endOfDay(reference) };
  if (preset === "currentMonth") return { preset, start: new Date(reference.getFullYear(), reference.getMonth(), 1), end: endOfDay(reference) };
  if (preset === "previousMonth") return { preset, start: new Date(reference.getFullYear(), reference.getMonth() - 1, 1), end: endOfDay(new Date(reference.getFullYear(), reference.getMonth(), 0)) };
  if (preset === "custom" && customStart && customEnd) return { preset, start: startOfDay(new Date(`${customStart}T00:00:00`)), end: endOfDay(new Date(`${customEnd}T00:00:00`)) };
  return { preset: "today", start: today, end: endOfDay(reference) };
}

export function getPreviousPeriod(period: Pick<ReportPeriod, "start" | "end">): ReportPeriod {
  const duration = period.end.getTime() - period.start.getTime();
  const end = new Date(period.start.getTime() - 1);
  const start = new Date(end.getTime() - duration);
  return { preset: "custom", start, end };
}

export function compareValues(current: number, previous: number): Comparison {
  const absolute = current - previous;
  if (previous === 0) return { direction: "unknown", absolute, percent: null, label: "Sem dados suficientes para comparação." };
  const percent = (absolute / previous) * 100;
  const direction = absolute > 0 ? "up" : absolute < 0 ? "down" : "neutral";
  return { direction, absolute, percent, label: direction === "up" ? "Aumento" : direction === "down" ? "Redução" : "Sem alteração" };
}

export function calculateSummary(orders: Order[], sessions: TableSession[]): SummaryMetrics {
  const billable = orders.filter(isBillableOrder);
  const revenue = billable.reduce((sum, order) => sum + order.total, 0);
  const soldItems = billable.flatMap((order) => order.items).reduce((sum, item) => sum + item.quantity, 0);
  const usedTables = new Set([...orders.map((order) => order.tableId), ...sessions.map((session) => session.tableId)]).size;
  const cancelledOrders = orders.filter(isCancelledOrder).length;
  return { revenue, validOrders: billable.length, averageTicket: calculateAverageTicket(revenue, billable.length), soldItems, attendances: sessions.length, usedTables, cancelledOrders, cancellationRate: safePercent(cancelledOrders, orders.length), totalOrders: orders.length };
}

function categoryFor(itemId: string, menuItems: MenuItem[], categories: MenuCategory[]): string {
  const item = menuItems.find((entry) => entry.id === itemId);
  return categories.find((category) => category.id === item?.categoryId)?.name ?? "Sem categoria";
}

export function groupProducts(orders: Order[], menuItems: MenuItem[], categories: MenuCategory[]): ProductMetric[] {
  const billable = orders.filter(isBillableOrder);
  const totalQuantity = billable.flatMap((order) => order.items).reduce((sum, item) => sum + item.quantity, 0);
  const map = new Map<string, ProductMetric>();
  billable.forEach((order) => order.items.forEach((item) => { const key = item.menuItemId || item.nameSnapshot; const current = map.get(key) ?? { key, name: item.nameSnapshot, category: categoryFor(item.menuItemId, menuItems, categories), quantity: 0, revenue: 0, share: 0 }; current.quantity += item.quantity; current.revenue += item.total; current.share = safePercent(current.quantity, totalQuantity); map.set(key, current); }));
  return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);
}

export function groupCategories(products: ProductMetric[]): CategoryMetric[] {
  const total = products.reduce((sum, item) => sum + item.quantity, 0);
  const map = new Map<string, CategoryMetric>();
  products.forEach((item) => { const current = map.get(item.category) ?? { name: item.category || "Sem categoria", quantity: 0, revenue: 0, share: 0 }; current.quantity += item.quantity; current.revenue += item.revenue; current.share = safePercent(current.quantity, total); map.set(current.name, current); });
  return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity);
}

export function groupPayments(orders: Order[]): PaymentMetric[] {
  const totalRevenue = orders.filter(isBillableOrder).reduce((sum, order) => sum + order.total, 0);
  const map = new Map<PaymentMethod | "other", PaymentMetric>();
  orders.forEach((order) => { const key = order.paymentMethod; const current = map.get(key) ?? { method: key, orders: 0, total: 0, share: 0, pending: 0, confirmed: 0, cancelled: 0 }; current.orders += 1; if (isBillableOrder(order)) { current.total += order.total; current.confirmed += 1; } else if (isCancelledOrder(order)) current.cancelled += 1; else current.pending += 1; current.share = safePercent(current.total, totalRevenue); map.set(key, current); });
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export function sessionDurationMinutes(session: Pick<TableSession, "startedAt" | "closedAt">): number | null { if (!session.closedAt) return null; const diff = new Date(session.closedAt).getTime() - new Date(session.startedAt).getTime(); return diff >= 0 ? diff / 60000 : null; }
export function calculateAverageClosedSessionDuration(sessions: TableSession[]): number { const durations = sessions.map(sessionDurationMinutes).filter((value): value is number => value !== null); return durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0; }

export function groupTables(orders: Order[], sessions: TableSession[], events: OrderEvent[]): TableMetric[] {
  const tableIds = new Set([...orders.map((order) => order.tableId), ...sessions.map((session) => session.tableId)]);
  return Array.from(tableIds).map((tableId) => { const tableSessions = sessions.filter((session) => session.tableId === tableId); const tableOrders = orders.filter((order) => order.tableId === tableId); const billable = tableOrders.filter(isBillableOrder); const revenue = billable.reduce((sum, order) => sum + order.total, 0); const waiterCalls = events.filter((event) => event.tableId === tableId && event.type === "waiter_called").length; return { tableId, tableNumber: tableSessions[0]?.tableNumber ?? tableOrders[0]?.tableNumber ?? 0, attendances: tableSessions.length, orders: tableOrders.length, revenue, averageTicket: calculateAverageTicket(revenue, billable.length), averageDurationMinutes: calculateAverageClosedSessionDuration(tableSessions), openSessions: tableSessions.filter((session) => !session.closedAt && session.status !== "closed").length, waiterCalls }; }).sort((a, b) => b.revenue - a.revenue);
}
