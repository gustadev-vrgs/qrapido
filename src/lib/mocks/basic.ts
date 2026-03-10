import type { DailyMetric, Order, Table } from "@/lib/types/domain";

export const mockTables: Table[] = [
  {
    id: "table-1",
    restaurantId: "rest-1",
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: "2026-01-01T10:00:00.000Z",
    code: "A1",
    number: 1,
    status: "active",
    seats: 4
  },
  {
    id: "table-2",
    restaurantId: "rest-1",
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: "2026-01-01T10:00:00.000Z",
    code: "A2",
    number: 2,
    status: "free",
    seats: 2
  }
];

export const mockOrders: Order[] = [
  {
    id: "order-1",
    restaurantId: "rest-1",
    createdAt: "2026-01-02T15:20:00.000Z",
    updatedAt: "2026-01-02T15:24:00.000Z",
    tableId: "table-1",
    tableSessionId: "session-1",
    status: "in_preparation",
    items: [{ menuItemId: "item-1", nameSnapshot: "Hambúrguer da Casa", quantity: 2, unitPriceInCents: 3590 }],
    totalInCents: 7180,
    idempotencyKey: "demo-key-1"
  }
];

export const mockDailyMetrics: DailyMetric[] = [
  {
    id: "metric-1",
    restaurantId: "rest-1",
    createdAt: "2026-01-03T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
    date: "2026-01-03",
    grossRevenueInCents: 184500,
    completedOrdersCount: 32,
    avgTicketInCents: 5765
  }
];
