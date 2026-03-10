export type TableStatus = "free" | "active" | "awaiting_payment" | "closed" | "blocked";
export type SessionStatus = "active" | "expired" | "closed" | "blocked";
export type OrderStatus = "received" | "in_preparation" | "ready" | "delivered" | "cancelled";
export type PaymentMethod = "pix" | "cash" | "card_on_counter" | "card_on_table";
export type UserRole = "admin" | "manager" | "attendant" | "kitchen";
export type EventType =
  | "session_created"
  | "session_closed"
  | "order_created"
  | "order_updated"
  | "order_cancelled"
  | "waiter_called"
  | "bill_requested"
  | "table_opened"
  | "table_closed";

interface BaseEntity {
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
  displayName: string;
  role: UserRole;
}

export interface Table extends BaseEntity {
  code: string;
  number: number;
  status: TableStatus;
  seats: number;
}

export interface TableSession extends BaseEntity {
  tableId: string;
  status: SessionStatus;
  peopleCount: number;
  sessionToken: string;
  expiresAt: string;
}

export interface MenuCategory extends BaseEntity {
  name: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
}

export interface MenuItem extends BaseEntity {
  categoryId: string;
  name: string;
  description?: string;
  priceInCents: number;
  isAvailable: boolean;
}

export interface OrderItem {
  menuItemId: string;
  nameSnapshot: string;
  quantity: number;
  unitPriceInCents: number;
  notes?: string;
}

export interface Order extends BaseEntity {
  tableId: string;
  tableSessionId: string;
  status: OrderStatus;
  items: OrderItem[];
  totalInCents: number;
  idempotencyKey: string;
}

export interface OrderEvent extends BaseEntity {
  orderId: string;
  type: EventType;
  actor: "staff" | "customer" | "system";
  message?: string;
}

export interface RestaurantSettings extends BaseEntity {
  timezone: string;
  serviceChargePercentage: number;
  acceptedPaymentMethods: PaymentMethod[];
}

export interface DailyMetric extends BaseEntity {
  date: string;
  grossRevenueInCents: number;
  completedOrdersCount: number;
  avgTicketInCents: number;
}
