import type { DailyMetric, MenuCategory, MenuItem, Order, Table, TableSession } from "@/lib/types/domain";

export const restaurantId = "demo-restaurant";

export const tables: Table[] = [
  { id: "t1", restaurantId, number: "Mesa 01", capacity: 4, status: "occupied", activeSessionCount: 3, createdAt: "", updatedAt: "" },
  { id: "t2", restaurantId, number: "Mesa 02", capacity: 2, status: "active", activeSessionCount: 1, createdAt: "", updatedAt: "" },
  { id: "t3", restaurantId, number: "Varanda 04", capacity: 6, status: "inactive", activeSessionCount: 0, createdAt: "", updatedAt: "" }
];

export const sessions: TableSession[] = [
  { id: "s1", restaurantId, tableId: "t1", customerName: "Carla", status: "active", expiresAt: "2026-06-15T22:00:00.000Z", token: "qr_s1", createdAt: "", updatedAt: "" },
  { id: "s2", restaurantId, tableId: "t2", customerName: "Leon", status: "active", expiresAt: "2026-06-15T22:30:00.000Z", token: "qr_s2", createdAt: "", updatedAt: "" }
];

export const menuCategories: MenuCategory[] = [
  { id: "c1", restaurantId, name: "Assinaturas", description: "Pratos da casa", isActive: true, createdAt: "", updatedAt: "" },
  { id: "c2", restaurantId, name: "Coquetéis", description: "Mixologia autoral", isActive: true, createdAt: "", updatedAt: "" }
];

export const menuItems: MenuItem[] = [
  { id: "m1", restaurantId, categoryId: "c1", name: "Risoto de Cogumelos", description: "Arroz arbóreo, funghi e parmesão", priceInCents: 6200, isAvailable: true, createdAt: "", updatedAt: "" },
  { id: "m2", restaurantId, categoryId: "c2", name: "Negroni Reserva", description: "Blend da casa", priceInCents: 3900, isAvailable: true, createdAt: "", updatedAt: "" }
];

export const orders: Order[] = [
  { id: "o1", restaurantId, tableId: "t1", sessionId: "s1", customerName: "Carla", status: "preparing", totalInCents: 10100, dedupeKey: "abc12345", createdAt: "", updatedAt: "" },
  { id: "o2", restaurantId, tableId: "t2", sessionId: "s2", customerName: "Leon", status: "pending", totalInCents: 3900, dedupeKey: "xyz12345", createdAt: "", updatedAt: "" }
];

export const metrics: DailyMetric[] = [
  { id: "d1", restaurantId, day: "Seg", revenueInCents: 420000, orderCount: 88, occupancyRate: 72, createdAt: "", updatedAt: "" },
  { id: "d2", restaurantId, day: "Ter", revenueInCents: 510000, orderCount: 104, occupancyRate: 81, createdAt: "", updatedAt: "" },
  { id: "d3", restaurantId, day: "Qua", revenueInCents: 478000, orderCount: 96, occupancyRate: 76, createdAt: "", updatedAt: "" }
];
