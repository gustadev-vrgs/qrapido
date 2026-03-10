export const staffRoles = ["admin", "staff"] as const;
export type StaffRole = (typeof staffRoles)[number];

export const tableStatuses = ["inactive", "active", "occupied", "closing"] as const;
export type TableStatus = (typeof tableStatuses)[number];

export const sessionStatuses = ["active", "expired", "closed"] as const;
export type SessionStatus = (typeof sessionStatuses)[number];

export const orderStatuses = ["pending", "accepted", "preparing", "ready", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof orderStatuses)[number];

export const orderEventTypes = ["created", "status_changed", "item_added", "call_waiter", "request_bill", "closed"] as const;
export type OrderEventType = (typeof orderEventTypes)[number];

export const actorTypes = ["customer", "staff", "system"] as const;
export type ActorType = (typeof actorTypes)[number];

export interface BaseEntity {
  id: string;
  restaurantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Restaurant extends BaseEntity {
  name: string;
  slug: string;
  isActive: boolean;
}

export interface StaffUser extends BaseEntity {
  uid: string;
  email: string;
  role: StaffRole;
  displayName: string;
  isActive: boolean;
  lastLoginAt?: string;
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
  peopleCount: number;
  status: SessionStatus;
  expiresAt: string;
  token: string;
}

export interface MenuCategory extends BaseEntity {
  name: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
}

export interface MenuItem extends BaseEntity {
  categoryId: string;
  name: string;
  description: string;
  priceInCents: number;
  sortOrder: number;
  isAvailable: boolean;
}

export interface OrderItem {
  menuItemId: string;
  nameSnapshot: string;
  unitPriceInCents: number;
  quantity: number;
  notes?: string;
}

export interface Order extends BaseEntity {
  tableId: string;
  sessionId: string;
  customerName?: string;
  status: OrderStatus;
  items: OrderItem[];
  totalInCents: number;
  dedupeKey: string;
}

export interface OrderEvent extends BaseEntity {
  orderId: string;
  sessionId: string;
  eventType: OrderEventType;
  actor: ActorType;
  metadata: Record<string, string>;
}

export interface RestaurantSettings extends BaseEntity {
  timezone: string;
  currency: string;
  maxOrdersPerMinute: number;
  sessionTtlMinutes: number;
  allowWaiterCall: boolean;
}

export interface DailyMetric extends BaseEntity {
  date: string;
  revenueInCents: number;
  orderCount: number;
  occupancyRate: number;
  avgTicketInCents: number;
}
