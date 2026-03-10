export type TableStatus = "inactive" | "active" | "occupied" | "closing";
export type SessionStatus = "active" | "expired" | "closed";
export type OrderStatus = "pending" | "accepted" | "preparing" | "ready" | "delivered" | "cancelled";

export interface BaseEntity {
  id: string;
  restaurantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Restaurant extends BaseEntity {
  name: string;
  slug: string;
}

export interface StaffUser extends BaseEntity {
  email: string;
  role: "admin" | "staff";
  displayName: string;
}

export interface Table extends BaseEntity {
  number: string;
  capacity: number;
  status: TableStatus;
  activeSessionCount: number;
}

export interface TableSession extends BaseEntity {
  tableId: string;
  customerName?: string;
  status: SessionStatus;
  expiresAt: string;
  token: string;
}

export interface MenuCategory extends BaseEntity {
  name: string;
  description: string;
  isActive: boolean;
}

export interface MenuItem extends BaseEntity {
  categoryId: string;
  name: string;
  description: string;
  priceInCents: number;
  isAvailable: boolean;
}

export interface Order extends BaseEntity {
  tableId: string;
  sessionId: string;
  customerName?: string;
  status: OrderStatus;
  totalInCents: number;
  dedupeKey: string;
}

export interface OrderEvent extends BaseEntity {
  orderId: string;
  eventType: "created" | "updated" | "delivered" | "call_waiter" | "request_bill";
  actor: "customer" | "staff" | "system";
  metadata: Record<string, string>;
}

export interface RestaurantSettings extends BaseEntity {
  timezone: string;
  currency: string;
  maxOrdersPerMinute: number;
  sessionTtlMinutes: number;
}

export interface DailyMetric extends BaseEntity {
  day: string;
  revenueInCents: number;
  orderCount: number;
  occupancyRate: number;
}
