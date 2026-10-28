import "server-only";

import type { OrderItemOption } from "@/lib/types/domain";
import { toRestaurantDateKey } from "@/lib/utils/date-key";
import { isServedOn, normalizeDays, normalizeOptionGroups, resolveChoices, restaurantWeekday } from "@/lib/utils/menu-options";
import { resolveStation } from "@/lib/utils/stations";

type Tx = any;
type Db = any;

export const money = (value: number): number => Math.round(value * 100) / 100;

export interface CartInput { menuItemId: string; quantity: number; notes?: string | null; options?: Array<{ groupId: string; optionId: string }> }

export interface ResolvedItem {
  menuItemId: string;
  nameSnapshot: string;
  categoryIdSnapshot: string | null;
  categoryNameSnapshot: string;
  station: "kitchen" | "ready";
  priceSnapshot: number;
  quantity: number;
  notes: string | null;
  total: number;
  options: OrderItemOption[];
}

export class CartError extends Error {
  constructor(public readonly code: "ITEM_UNAVAILABLE" | "ITEM_INVALID" | "OPTION_INVALID", public readonly detail?: string) { super(code); }
}

/** Message for the person who sent the cart. */
export function cartErrorMessage(error: CartError): string {
  if (error.code === "OPTION_INVALID") return error.detail ? `Revise as escolhas de "${error.detail}" e tente de novo.` : "As opções de um prato mudaram. Escolha de novo e tente outra vez.";
  return "Um dos produtos acabou de ficar indisponível. Remova-o e tente novamente.";
}

/**
 * Reads the products of a cart inside the transaction (before any write) and
 * returns them priced by the server. Unavailable/inactive products fail the cart.
 */
export async function readCartItems(tx: Tx, db: Db, restaurantId: string, cart: CartInput[]): Promise<ResolvedItem[]> {
  const menuSnaps = await Promise.all(cart.map((item) => tx.get(db.collection("menuItems").doc(item.menuItemId))));
  const categoryIds = [...new Set(menuSnaps.map((snap: any) => snap.data()?.categoryId).filter(Boolean))] as string[];
  const categorySnaps = await Promise.all(categoryIds.map((id) => tx.get(db.collection("menuCategories").doc(id))));
  const activeCategories = categorySnaps.filter((snap: any) => snap.exists && snap.data().isActive !== false && snap.data().restaurantId === restaurantId);
  const categoryNames = new Map(activeCategories.map((snap: any) => [snap.id, String(snap.data().name ?? "Sem categoria").slice(0, 80)]));
  const today = restaurantWeekday();
  return cart.map((input, index) => {
    const snap = menuSnaps[index];
    const product = snap.exists ? snap.data() : null;
    if (!product || product.restaurantId !== restaurantId || product.isActive === false || product.isAvailable === false || !categoryNames.has(product.categoryId)) throw new CartError("ITEM_UNAVAILABLE");
    if (!isServedOn(normalizeDays(product.availableDays), today)) throw new CartError("ITEM_UNAVAILABLE");
    const basePrice = Number(product.price);
    if (!Number.isFinite(basePrice) || basePrice < 0) throw new CartError("ITEM_INVALID");
    const choices = resolveChoices(normalizeOptionGroups(product.optionGroups), input.options);
    if ("error" in choices) throw new CartError("OPTION_INVALID", choices.group);
    const price = basePrice + choices.extra;
    const categoryName = categoryNames.get(product.categoryId) ?? "Sem categoria";
    return {
      menuItemId: snap.id,
      nameSnapshot: String(product.name ?? "").slice(0, 120),
      categoryIdSnapshot: product.categoryId ?? null,
      categoryNameSnapshot: categoryName,
      station: resolveStation(product.station, categoryName),
      priceSnapshot: money(price),
      quantity: input.quantity,
      notes: input.notes || null,
      total: money(price * input.quantity),
      options: choices.options
    };
  });
}

export function cartTotal(items: ResolvedItem[], serviceFeePercent: number): number {
  const subtotal = money(items.reduce((sum, item) => sum + item.total, 0));
  return money(subtotal + money(subtotal * serviceFeePercent / 100));
}

export interface WriteCartOptions {
  restaurantId: string;
  session: { id: string; tableId: string; tableNumber: number; sessionToken: string; customerName: string | null; completedOrdersCount: number };
  items: ResolvedItem[];
  serviceFeePercent: number;
  customerName: string | null;
  notes: string | null;
  paymentMethod: string;
  paymentMode: "system_simulated" | "counter" | "waiter";
  changeFor: number | null;
  contentHash: string;
  actor: { type: "customer" | "staff"; id: string | null };
  nowMs: number;
}

export interface CartSummary {
  orderId: string;
  orderCode: string;
  groupCode: string;
  orders: Array<{ orderId: string; orderCode: string; station: "kitchen" | "ready" }>;
  subtotal: number;
  serviceFee: number;
  total: number;
}

const paymentStatus = (mode: string): string => mode === "system_simulated" ? "simulado — sem recebimento confirmado" : mode === "counter" ? "pagamento pendente no caixa" : "pagamento pendente com garçom";

/**
 * Writes one cart as orders. Dishes go to the kitchen; drinks and other ready
 * items become a separate order that is already "ready" (no kitchen step).
 * Only writes: call it after every read of the transaction.
 */
export function writeCartOrders(tx: Tx, db: Db, options: WriteCartOptions): CartSummary {
  const { restaurantId, session, items, serviceFeePercent, actor, nowMs } = options;
  const now = new Date(nowMs).toISOString();
  const sequence = (session.completedOrdersCount ?? 0) + 1;
  const groupCode = `M${session.tableNumber}-${String(sequence).padStart(2, "0")}`;
  const dateKey = toRestaurantDateKey(new Date(nowMs));
  const byStaff = actor.type === "staff";
  const groups = (["kitchen", "ready"] as const).map((station) => ({ station, items: items.filter((item) => item.station === station) })).filter((group) => group.items.length > 0);

  const created = groups.map((group, index) => {
    const orderRef = db.collection("orders").doc();
    const orderCode = `${groupCode}-${orderRef.id.slice(-4).toUpperCase()}`;
    const subtotal = money(group.items.reduce((sum, item) => sum + item.total, 0));
    const serviceFee = money(subtotal * serviceFeePercent / 100);
    const total = money(subtotal + serviceFee);
    const ready = group.station === "ready";
    tx.set(orderRef, {
      restaurantId, orderCode, groupCode, station: group.station, tableId: session.tableId, tableNumber: session.tableNumber, sessionId: session.id, sessionToken: session.sessionToken,
      customerName: options.customerName || session.customerName || null, items: group.items, subtotal, serviceFeePercent, serviceFee, total,
      paymentMethod: options.paymentMethod, paymentMode: options.paymentMode, paymentStatus: paymentStatus(options.paymentMode), financialReceiptConfirmed: false, simulation: options.paymentMode === "system_simulated",
      // Change is for the whole cart: kept on the first order only.
      changeFor: index === 0 ? options.changeFor ?? null : null,
      status: ready ? "ready" : "received", readyAt: ready ? now : null, notes: index === 0 ? options.notes || null : null,
      duplicateGuardHash: options.contentHash, dateKey, receivedAt: now, deliveredAt: null, cancelledAt: null,
      // The table quota counts carts, not the internal split.
      quotaCounted: index === 0,
      ...(byStaff ? { createdByStaffId: actor.id } : {}),
      createdAt: now, updatedAt: now
    });
    const who = byStaff ? "pela equipe" : "pelo cliente";
    tx.set(db.collection("orderEvents").doc(), { restaurantId, orderId: orderRef.id, tableId: session.tableId, sessionId: session.id, type: "order_created", actorType: actor.type, actorId: actor.id, message: ready ? `Pedido de pronta entrega criado ${who}` : `Pedido criado ${who}`, metadata: { orderCode, station: group.station }, createdAt: now });
    tx.set(db.collection("adminAlerts").doc(), { restaurantId, orderId: orderRef.id, tableId: session.tableId, sessionId: session.id, type: "new_order", message: `Novo pedido ${orderCode}`, read: false, createdAt: now, updatedAt: now });
    return { orderId: orderRef.id, orderCode, station: group.station, subtotal, serviceFee, total };
  });

  const primary = created[0];
  tx.update(db.collection("tableSessions").doc(session.id), { completedOrdersCount: sequence, lastActivityAt: now, updatedAt: now });
  return {
    orderId: primary.orderId,
    orderCode: primary.orderCode,
    groupCode,
    orders: created.map(({ orderId, orderCode, station }) => ({ orderId, orderCode, station })),
    subtotal: money(items.reduce((sum, item) => sum + item.total, 0)),
    serviceFee: money(created.reduce((sum, order) => sum + order.serviceFee, 0)),
    total: money(created.reduce((sum, order) => sum + order.total, 0))
  };
}
