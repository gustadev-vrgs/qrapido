import "server-only";

import type { PublicOrder } from "@/lib/types/domain";

/** Only the fields a diner needs; never staff notes, tokens or audit data. */
export function toPublicOrder(id: string, d: Record<string, any>): PublicOrder {
  return {
    id,
    orderCode: d.orderCode ?? `#${id.slice(-6).toUpperCase()}`,
    tableNumber: d.tableNumber,
    items: (Array.isArray(d.items) ? d.items : []).map((item: Record<string, any>) => ({ menuItemId: item.menuItemId, nameSnapshot: item.nameSnapshot, priceSnapshot: item.priceSnapshot, quantity: item.quantity, notes: item.notes ?? null, total: item.total })),
    station: d.station === "ready" ? "ready" : "kitchen",
    groupCode: d.groupCode ?? null,
    subtotal: d.subtotal,
    serviceFee: d.serviceFee ?? 0,
    total: d.total,
    paymentMethod: d.paymentMethod,
    paymentMode: d.paymentMode ?? null,
    paymentStatus: d.paymentStatus ?? null,
    status: d.status,
    cancellationReason: d.status === "cancelled" ? d.cancellationReason ?? null : null,
    receivedAt: d.receivedAt,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt
  };
}
