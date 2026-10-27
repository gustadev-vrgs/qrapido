import type { DocumentData } from "firebase/firestore";

import { DEFAULT_BUSINESS_HOURS } from "@/lib/constants/restaurant-settings";
import { ensureIsoTimestamp } from "@/lib/data/helpers/serialization";
import {
  ORDER_STATUSES,
  PAYMENT_METHODS,
  SESSION_STATUSES,
  TABLE_STATUSES,
  USER_ROLES,
  type BusinessHours,
  type DailyMetric,
  type MenuCategory,
  type MenuItem,
  type Order,
  type OrderEvent,
  type OrderItem,
  type PaymentMethod,
  type Restaurant,
  type RestaurantSettings,
  type StaffUser,
  type Table,
  type TableSession,
  type WeekdayKey
} from "@/lib/types/domain";

/*
 * Readers are deliberately tolerant. Documents written by older versions of the
 * app (or edited by hand in the Firebase console) used to fail strict schema
 * validation, and a single bad document made a whole screen fail with
 * "verifique conexão e permissões". Writes are still validated strictly by the
 * services; here every field gets a safe default instead.
 */

const EPOCH = new Date(0).toISOString();

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}
function nullableStr(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}
function iso(value: unknown, fallback: string = EPOCH): string {
  return ensureIsoTimestamp(value, fallback) ?? fallback;
}
function nullableIso(value: unknown): string | null {
  return ensureIsoTimestamp(value, null);
}
function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}
function base(id: string, data: DocumentData) {
  return { id, restaurantId: str(data.restaurantId), createdAt: iso(data.createdAt), updatedAt: iso(data.updatedAt ?? data.createdAt) };
}

export function mapStaffUser(id: string, data: DocumentData): StaffUser {
  return { ...base(id, data), uid: str(data.uid, id), name: str(data.name, "Sem nome"), email: str(data.email), role: oneOf(data.role, USER_ROLES, "attendant"), isActive: bool(data.isActive, false) };
}

export function mapRestaurant(id: string, data: DocumentData): Restaurant {
  return { ...base(id, data), restaurantId: str(data.restaurantId, id), name: str(data.name, "Restaurante"), slug: str(data.slug, id), description: str(data.description), address: str(data.address), phone: str(data.phone), logoUrl: nullableStr(data.logoUrl), isActive: bool(data.isActive, true) };
}

export function mapTable(id: string, data: DocumentData): Table {
  const number = num(data.number, 0);
  return {
    ...base(id, data),
    number,
    label: str(data.label) || `Mesa ${number}`,
    status: oneOf(data.status, TABLE_STATUSES, "free"),
    capacity: Math.max(1, num(data.capacity, 4)),
    currentPeopleCount: Math.max(0, num(data.currentPeopleCount, 0)),
    activeSessionLimit: Math.max(1, num(data.activeSessionLimit, 1)),
    activeSessionCount: Math.max(0, num(data.activeSessionCount, 0)),
    currentSessionGroupId: nullableStr(data.currentSessionGroupId),
    pinCode: nullableStr(data.pinCode),
    qrCodeValue: str(data.qrCodeValue),
    publicToken: str(data.publicToken),
    isActive: bool(data.isActive, true),
    openedAt: nullableIso(data.openedAt),
    closedAt: nullableIso(data.closedAt),
    archivedAt: nullableIso(data.archivedAt)
  };
}

export function mapSession(id: string, data: DocumentData): TableSession {
  return {
    ...base(id, data),
    tableId: str(data.tableId),
    tableNumber: num(data.tableNumber, 0),
    sessionToken: str(data.sessionToken),
    sessionLabel: str(data.sessionLabel),
    customerName: nullableStr(data.customerName),
    status: oneOf(data.status, SESSION_STATUSES, "closed"),
    deviceFingerprint: nullableStr(data.deviceFingerprint),
    startedAt: iso(data.startedAt ?? data.createdAt),
    expiresAt: iso(data.expiresAt),
    closedAt: nullableIso(data.closedAt),
    lastActivityAt: iso(data.lastActivityAt ?? data.updatedAt),
    requestCountWindow: num(data.requestCountWindow, 0),
    peopleCount: Math.max(1, num(data.peopleCount, 1)),
    maxOrdersAllowed: Math.max(0, num(data.maxOrdersAllowed, 0)),
    orderLimitEnabled: bool(data.orderLimitEnabled, false),
    completedOrdersCount: Math.max(0, num(data.completedOrdersCount, 0)),
    openedByStaffId: nullableStr(data.openedByStaffId),
    notes: nullableStr(data.notes),
    staffAccessCode: nullableStr(data.staffAccessCode),
    accessCodeIssuedAt: nullableIso(data.accessCodeIssuedAt)
  };
}

export function mapMenuCategory(id: string, data: DocumentData): MenuCategory {
  return { ...base(id, data), name: str(data.name, "Sem nome"), slug: str(data.slug, id), description: str(data.description), sortOrder: num(data.sortOrder, 0), isActive: bool(data.isActive, true) };
}

export function mapMenuItem(id: string, data: DocumentData): MenuItem {
  return {
    ...base(id, data),
    categoryId: str(data.categoryId),
    name: str(data.name, "Sem nome"),
    slug: str(data.slug, id),
    description: str(data.description),
    price: Math.max(0, num(data.price, 0)),
    imageUrl: nullableStr(data.imageUrl),
    preparationTimeMinutes: Math.max(0, num(data.preparationTimeMinutes, 0)),
    isActive: bool(data.isActive, true),
    isAvailable: bool(data.isAvailable, true),
    isFeatured: bool(data.isFeatured, false),
    sortOrder: num(data.sortOrder, 0),
    station: data.station === "kitchen" || data.station === "ready" ? data.station : null
  };
}

function mapOrderItem(raw: unknown): OrderItem {
  const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    menuItemId: str(item.menuItemId),
    nameSnapshot: str(item.nameSnapshot ?? item.name, "Item"),
    priceSnapshot: num(item.priceSnapshot ?? item.price, 0),
    quantity: Math.max(1, num(item.quantity, 1)),
    notes: nullableStr(item.notes),
    total: num(item.total, num(item.priceSnapshot ?? item.price, 0) * Math.max(1, num(item.quantity, 1))),
    categoryIdSnapshot: nullableStr(item.categoryIdSnapshot),
    categoryNameSnapshot: nullableStr(item.categoryNameSnapshot),
    station: item.station === "ready" ? "ready" : "kitchen"
  };
}

export function mapOrder(id: string, data: DocumentData): Order {
  const receivedAt = iso(data.receivedAt ?? data.createdAt);
  return {
    ...base(id, data),
    orderCode: str(data.orderCode) || `#${id.slice(-6).toUpperCase()}`,
    dateKey: nullableStr(data.dateKey) ?? undefined,
    station: data.station === "ready" ? "ready" : "kitchen",
    groupCode: nullableStr(data.groupCode) ?? undefined,
    readyAt: nullableIso(data.readyAt),
    autoDelivered: bool(data.autoDelivered, false),
    tableId: str(data.tableId),
    tableNumber: num(data.tableNumber, 0),
    sessionId: str(data.sessionId),
    sessionToken: str(data.sessionToken),
    customerName: nullableStr(data.customerName),
    items: Array.isArray(data.items) ? data.items.map(mapOrderItem) : [],
    subtotal: num(data.subtotal, 0),
    serviceFee: num(data.serviceFee, 0),
    total: num(data.total, num(data.subtotal, 0)),
    paymentMethod: oneOf<PaymentMethod>(data.paymentMethod, PAYMENT_METHODS, "cash"),
    paymentMode: data.paymentMode === "system_simulated" || data.paymentMode === "counter" || data.paymentMode === "waiter" ? data.paymentMode : undefined,
    paymentStatus: nullableStr(data.paymentStatus) ?? undefined,
    financialReceiptConfirmed: bool(data.financialReceiptConfirmed, false),
    simulation: bool(data.simulation, false),
    changeFor: data.changeFor == null ? null : num(data.changeFor, 0),
    status: oneOf(data.status, ORDER_STATUSES, "received"),
    notes: nullableStr(data.notes),
    duplicateGuardHash: str(data.duplicateGuardHash),
    receivedAt,
    deliveredAt: nullableIso(data.deliveredAt),
    cancelledAt: nullableIso(data.cancelledAt),
    cancellationReason: nullableStr(data.cancellationReason),
    quotaReleasedAt: nullableIso(data.quotaReleasedAt)
  };
}

export function mapOrderEvent(id: string, data: DocumentData): OrderEvent {
  return {
    id,
    restaurantId: str(data.restaurantId),
    orderId: str(data.orderId, "system"),
    tableId: str(data.tableId),
    sessionId: str(data.sessionId),
    type: str(data.type, "order_updated"),
    actorType: oneOf(data.actorType, ["staff", "customer", "system"] as const, "system"),
    actorId: nullableStr(data.actorId),
    message: str(data.message),
    metadata: data.metadata && typeof data.metadata === "object" ? (data.metadata as Record<string, unknown>) : {},
    createdAt: iso(data.createdAt)
  };
}

export function mapDailyMetric(id: string, data: DocumentData): DailyMetric {
  return {
    ...base(id, data),
    dateKey: str(data.dateKey),
    totalRevenue: num(data.totalRevenue, 0),
    totalOrders: num(data.totalOrders, 0),
    cancelledOrders: num(data.cancelledOrders, 0),
    averageTicket: num(data.averageTicket, 0),
    averagePreparationMinutes: num(data.averagePreparationMinutes, 0),
    occupiedTablesPeak: num(data.occupiedTablesPeak, 0),
    topItems: Array.isArray(data.topItems) ? data.topItems : []
  };
}

function mapBusinessHours(raw: unknown): BusinessHours {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
  const time = (input: unknown, fallback: string) => (typeof input === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(input) ? input : fallback);
  return (Object.keys(DEFAULT_BUSINESS_HOURS) as WeekdayKey[]).reduce((acc, day) => {
    const fallback = DEFAULT_BUSINESS_HOURS[day];
    const current = value[day] ?? {};
    acc[day] = { isOpen: bool(current.isOpen, fallback.isOpen), open: time(current.open, fallback.open), close: time(current.close, fallback.close) };
    return acc;
  }, {} as BusinessHours);
}

export function mapSettings(id: string, data: DocumentData): RestaurantSettings {
  const methods = Array.isArray(data.acceptedPaymentMethods) ? data.acceptedPaymentMethods.filter((method: unknown): method is PaymentMethod => PAYMENT_METHODS.includes(method as PaymentMethod)) : [];
  return {
    ...base(id, data),
    acceptedPaymentMethods: methods.length ? methods : ["pix", "cash", "debit_card", "credit_card"],
    pixKey: nullableStr(data.pixKey),
    pixReceiverName: nullableStr(data.pixReceiverName),
    pixReceiverCity: nullableStr(data.pixReceiverCity),
    pixInstructions: nullableStr(data.pixInstructions),
    businessHours: mapBusinessHours(data.businessHours),
    antiSpamWindowSeconds: Math.min(3600, Math.max(1, num(data.antiSpamWindowSeconds, 60))),
    maxOrdersPerWindow: Math.min(20, Math.max(1, num(data.maxOrdersPerWindow, 5))),
    defaultSessionDurationMinutes: Math.min(720, Math.max(15, num(data.defaultSessionDurationMinutes, 240))),
    allowSessionPin: false,
    requireCustomerName: bool(data.requireCustomerName, false),
    allowCustomerNotes: bool(data.allowCustomerNotes, true),
    serviceFeePercent: Math.min(100, Math.max(0, num(data.serviceFeePercent, 0))),
    waiterCallEnabled: bool(data.waiterCallEnabled ?? data.allowWaiterCall, true),
    billRequestEnabled: bool(data.billRequestEnabled, true)
  };
}
