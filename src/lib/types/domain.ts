export const TABLE_STATUSES = ["free", "active", "awaiting_payment", "closed", "blocked"] as const;
export type TableStatus = (typeof TABLE_STATUSES)[number];

export const SESSION_STATUSES = ["active", "idle", "expired", "closed", "blocked"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const ORDER_STATUSES = ["received", "confirmed", "in_preparation", "ready", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_METHODS = ["pix", "cash", "debit_card", "credit_card", "card_on_counter", "card_on_table"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const USER_ROLES = ["admin", "manager", "attendant", "kitchen"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ORDER_EVENT_TYPES = [
  "session_created",
  "session_closed",
  "order_created",
  "order_confirmed",
  "order_updated",
  "order_ready",
  "order_delivered",
  "order_cancelled",
  "waiter_called",
  "bill_requested",
  "table_opened",
  "table_closed"
] as const;
export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number];

export const ACTOR_TYPES = ["staff", "customer", "system"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export type ISODateTimeString = string;
export type ISODateString = string;

export interface BaseEntity {
  id: string;
  restaurantId: string;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface Restaurant extends BaseEntity {
  restaurantId: string;
  name: string;
  slug: string;
  description: string;
  address: string;
  phone: string;
  logoUrl: string | null;
  isActive: boolean;
}

export interface StaffUser extends BaseEntity {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
}

export interface Table extends BaseEntity {
  number: number;
  label: string;
  status: TableStatus;
  capacity: number;
  currentPeopleCount: number;
  activeSessionLimit: number;
  activeSessionCount: number;
  currentSessionGroupId: string | null;
  pinCode: string | null;
  qrCodeValue: string;
  openedAt: ISODateTimeString | null;
  closedAt: ISODateTimeString | null;
}

export interface TableSession extends BaseEntity {
  tableId: string;
  tableNumber: number;
  sessionToken: string;
  sessionLabel: string;
  customerName: string | null;
  status: SessionStatus;
  deviceFingerprint: string | null;
  startedAt: ISODateTimeString;
  expiresAt: ISODateTimeString;
  closedAt: ISODateTimeString | null;
  lastActivityAt: ISODateTimeString;
  requestCountWindow: number;
}

export interface MenuCategory extends BaseEntity {
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
}

export interface MenuItem extends BaseEntity {
  categoryId: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  imageUrl: string | null;
  preparationTimeMinutes: number;
  isActive: boolean;
  isAvailable: boolean;
  isFeatured: boolean;
  sortOrder: number;
}

export interface OrderItem {
  menuItemId: string;
  nameSnapshot: string;
  priceSnapshot: number;
  quantity: number;
  notes: string | null;
  total: number;
}

export interface Order extends BaseEntity {
  tableId: string;
  tableNumber: number;
  sessionId: string;
  sessionToken: string;
  customerName: string | null;
  items: OrderItem[];
  subtotal: number;
  serviceFee: number;
  total: number;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  notes: string | null;
  duplicateGuardHash: string;
  receivedAt: ISODateTimeString;
  deliveredAt: ISODateTimeString | null;
  cancelledAt: ISODateTimeString | null;
}

export interface OrderEvent {
  id: string;
  restaurantId: string;
  orderId: string;
  tableId: string;
  sessionId: string;
  type: OrderEventType;
  actorType: ActorType;
  actorId: string | null;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: ISODateTimeString;
}

export interface BusinessHoursDay {
  isOpen: boolean;
  open: string;
  close: string;
}

export type WeekdayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

export type BusinessHours = Record<WeekdayKey, BusinessHoursDay>;

export interface RestaurantSettings extends BaseEntity {
  acceptedPaymentMethods: PaymentMethod[];
  pixKey: string | null;
  businessHours: BusinessHours;
  antiSpamWindowSeconds: number;
  maxOrdersPerWindow: number;
  defaultSessionDurationMinutes: number;
  allowSessionPin: boolean;
  requireCustomerName: boolean;
  waiterCallEnabled: boolean;
  billRequestEnabled: boolean;
}

export interface TopItemMetric {
  menuItemId: string;
  nameSnapshot: string;
  quantity: number;
  revenue: number;
}

export interface DailyMetric extends BaseEntity {
  dateKey: ISODateString;
  totalRevenue: number;
  totalOrders: number;
  cancelledOrders: number;
  averageTicket: number;
  averagePreparationMinutes: number;
  occupiedTablesPeak: number;
  topItems: TopItemMetric[];
}

export type CreateRestaurantPayload = Omit<Restaurant, "id" | "createdAt" | "updatedAt">;
export type UpdateRestaurantPayload = Partial<CreateRestaurantPayload>;

export type CreateStaffUserPayload = Omit<StaffUser, "id" | "createdAt" | "updatedAt">;
export type UpdateStaffUserPayload = Partial<Omit<CreateStaffUserPayload, "uid" | "restaurantId">>;

export type CreateTablePayload = Omit<Table, "id" | "createdAt" | "updatedAt">;
export type UpdateTablePayload = Partial<Omit<CreateTablePayload, "restaurantId">>;

export type CreateTableSessionPayload = Omit<TableSession, "id" | "createdAt" | "updatedAt">;
export type UpdateTableSessionPayload = Partial<Omit<CreateTableSessionPayload, "restaurantId" | "tableId" | "sessionToken">>;

export type CreateMenuCategoryPayload = Omit<MenuCategory, "id" | "createdAt" | "updatedAt">;
export type UpdateMenuCategoryPayload = Partial<Omit<CreateMenuCategoryPayload, "restaurantId">>;

export type CreateMenuItemPayload = Omit<MenuItem, "id" | "createdAt" | "updatedAt">;
export type UpdateMenuItemPayload = Partial<Omit<CreateMenuItemPayload, "restaurantId">>;

export type CreateOrderPayload = Omit<Order, "id" | "createdAt" | "updatedAt" | "deliveredAt" | "cancelledAt">;
export type UpdateOrderPayload = Partial<Omit<CreateOrderPayload, "restaurantId" | "tableId" | "sessionId">> & Pick<Order, "deliveredAt" | "cancelledAt">;

export type CreateOrderEventPayload = Omit<OrderEvent, "id" | "createdAt">;

export type CreateRestaurantSettingsPayload = Omit<RestaurantSettings, "id" | "createdAt" | "updatedAt">;
export type UpdateRestaurantSettingsPayload = Partial<Omit<CreateRestaurantSettingsPayload, "restaurantId">>;

export type CreateDailyMetricPayload = Omit<DailyMetric, "id" | "createdAt" | "updatedAt">;
export type UpdateDailyMetricPayload = Partial<Omit<CreateDailyMetricPayload, "restaurantId" | "dateKey">>;

export const COLLECTION_NAMES = {
  restaurants: "restaurants",
  staffUsers: "staffUsers",
  tables: "tables",
  tableSessions: "tableSessions",
  menuCategories: "menuCategories",
  menuItems: "menuItems",
  orders: "orders",
  orderEvents: "orderEvents",
  restaurantSettings: "restaurantSettings",
  dailyMetrics: "dailyMetrics"
} as const;

export type CollectionName = (typeof COLLECTION_NAMES)[keyof typeof COLLECTION_NAMES];

export const restaurantScopedCollection = (restaurantId: string, collection: CollectionName) =>
  `${COLLECTION_NAMES.restaurants}/${restaurantId}/${collection}`;
