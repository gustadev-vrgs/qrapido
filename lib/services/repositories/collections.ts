export const collections = {
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

export type CollectionName = (typeof collections)[keyof typeof collections];
