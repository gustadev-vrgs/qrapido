import type {
  DailyMetric,
  MenuCategory,
  MenuItem,
  Order,
  OrderEvent,
  Restaurant,
  RestaurantSettings,
  StaffUser,
  Table,
  TableSession
} from "@/lib/types/domain";

const now = new Date().toISOString();
const restaurantId = "rest_demo_qrapido";

export const restaurant: Restaurant = {
  id: restaurantId,
  restaurantId,
  name: "QRápido Demo Bistrô",
  slug: "qrapido-demo-bistro",
  isActive: true,
  createdAt: now,
  updatedAt: now
};

export const staffUsers: StaffUser[] = [
  {
    id: "staff_admin_1",
    uid: "firebase_uid_admin_1",
    restaurantId,
    email: "admin@qrapido.demo",
    role: "admin",
    displayName: "Ana Admin",
    isActive: true,
    lastLoginAt: now,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "staff_waiter_1",
    uid: "firebase_uid_staff_1",
    restaurantId,
    email: "garcom@qrapido.demo",
    role: "staff",
    displayName: "Carlos Garçom",
    isActive: true,
    createdAt: now,
    updatedAt: now
  }
];

export const tables: Table[] = [
  { id: "t1", restaurantId, number: "Mesa 01", capacity: 4, status: "occupied", activeSessionCount: 1, createdAt: now, updatedAt: now },
  { id: "t2", restaurantId, number: "Mesa 02", capacity: 2, status: "active", activeSessionCount: 1, createdAt: now, updatedAt: now },
  { id: "t3", restaurantId, number: "Varanda 04", capacity: 6, status: "inactive", activeSessionCount: 0, createdAt: now, updatedAt: now }
];

export const sessions: TableSession[] = [
  {
    id: "s1",
    restaurantId,
    tableId: "t1",
    customerName: "Carla",
    peopleCount: 3,
    status: "active",
    expiresAt: "2026-06-15T22:00:00.000Z",
    token: "qr_s1",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "s2",
    restaurantId,
    tableId: "t2",
    customerName: "Leon",
    peopleCount: 2,
    status: "active",
    expiresAt: "2026-06-15T22:30:00.000Z",
    token: "qr_s2",
    createdAt: now,
    updatedAt: now
  }
];

export const menuCategories: MenuCategory[] = [
  { id: "c1", restaurantId, name: "Assinaturas", description: "Pratos da casa", sortOrder: 1, isActive: true, createdAt: now, updatedAt: now },
  { id: "c2", restaurantId, name: "Coquetéis", description: "Mixologia autoral", sortOrder: 2, isActive: true, createdAt: now, updatedAt: now }
];

export const menuItems: MenuItem[] = [
  {
    id: "m1",
    restaurantId,
    categoryId: "c1",
    name: "Risoto de Cogumelos",
    description: "Arroz arbóreo, funghi e parmesão",
    priceInCents: 6200,
    sortOrder: 1,
    isAvailable: true,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "m2",
    restaurantId,
    categoryId: "c2",
    name: "Negroni Reserva",
    description: "Blend da casa",
    priceInCents: 3900,
    sortOrder: 1,
    isAvailable: true,
    createdAt: now,
    updatedAt: now
  }
];

export const orders: Order[] = [
  {
    id: "o1",
    restaurantId,
    tableId: "t1",
    sessionId: "s1",
    customerName: "Carla",
    status: "preparing",
    items: [
      { menuItemId: "m1", nameSnapshot: "Risoto de Cogumelos", unitPriceInCents: 6200, quantity: 1 },
      { menuItemId: "m2", nameSnapshot: "Negroni Reserva", unitPriceInCents: 3900, quantity: 1 }
    ],
    totalInCents: 10100,
    dedupeKey: "abc12345",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "o2",
    restaurantId,
    tableId: "t2",
    sessionId: "s2",
    customerName: "Leon",
    status: "pending",
    items: [{ menuItemId: "m2", nameSnapshot: "Negroni Reserva", unitPriceInCents: 3900, quantity: 1 }],
    totalInCents: 3900,
    dedupeKey: "xyz12345",
    createdAt: now,
    updatedAt: now
  }
];

export const orderEvents: OrderEvent[] = [
  {
    id: "oe1",
    restaurantId,
    orderId: "o1",
    sessionId: "s1",
    eventType: "created",
    actor: "customer",
    metadata: { origin: "menu_qr" },
    createdAt: now,
    updatedAt: now
  }
];

export const settings: RestaurantSettings = {
  id: "settings_1",
  restaurantId,
  timezone: "America/Sao_Paulo",
  currency: "BRL",
  maxOrdersPerMinute: 8,
  sessionTtlMinutes: 120,
  allowWaiterCall: true,
  createdAt: now,
  updatedAt: now
};

export const metrics: DailyMetric[] = [
  { id: "d1", restaurantId, date: "2026-06-10", revenueInCents: 420000, orderCount: 88, occupancyRate: 72, avgTicketInCents: 4772, createdAt: now, updatedAt: now },
  { id: "d2", restaurantId, date: "2026-06-11", revenueInCents: 510000, orderCount: 104, occupancyRate: 81, avgTicketInCents: 4903, createdAt: now, updatedAt: now },
  { id: "d3", restaurantId, date: "2026-06-12", revenueInCents: 478000, orderCount: 96, occupancyRate: 76, avgTicketInCents: 4979, createdAt: now, updatedAt: now }
];

export const mockSeed = {
  restaurant,
  staffUsers,
  tables,
  sessions,
  menuCategories,
  menuItems,
  orders,
  orderEvents,
  settings,
  metrics
};
