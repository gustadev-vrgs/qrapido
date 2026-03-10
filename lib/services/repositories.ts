import { menuCategories, menuItems, metrics, orders, sessions, tables } from "@/lib/mocks/data";

export async function listTables() {
  return tables;
}

export async function listSessions() {
  return sessions;
}

export async function listOrders() {
  return orders;
}

export async function listMenu() {
  return { categories: menuCategories, items: menuItems };
}

export async function listMetrics() {
  return metrics;
}
