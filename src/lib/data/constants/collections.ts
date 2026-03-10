export const COLLECTIONS = {
  restaurants: "restaurants",
  staffUsers: "staffUsers",
  tables: "tables",
  sessions: "sessions",
  menuCategories: "menuCategories",
  menuItems: "menuItems",
  orders: "orders",
  orderEvents: "orderEvents",
  dailyMetrics: "dailyMetrics",
  settings: "settings"
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
