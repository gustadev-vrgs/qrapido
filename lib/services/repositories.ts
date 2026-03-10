import { db, firebaseEnabled } from "@/lib/firebase/client";
import {
  menuCategories,
  menuItems,
  metrics,
  orders,
  restaurant,
  sessions,
  settings,
  staffUsers,
  tables
} from "@/lib/mocks/data";
import { buildDomainRepositories } from "@/lib/services/repositories/domain-repositories";

const defaultRestaurantId = restaurant.id;

const repositories = db ? buildDomainRepositories(db) : null;

function shouldUseMockData(): boolean {
  return !firebaseEnabled || !repositories || process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";
}

export async function listTables() {
  if (shouldUseMockData()) {
    return tables;
  }

  return repositories!.tables.listByRestaurant(defaultRestaurantId);
}

export async function listSessions() {
  if (shouldUseMockData()) {
    return sessions;
  }

  return repositories!.tableSessions.listByRestaurant(defaultRestaurantId);
}

export async function listOrders() {
  if (shouldUseMockData()) {
    return orders;
  }

  return repositories!.orders.listByRestaurant(defaultRestaurantId);
}

export async function listMenu() {
  if (shouldUseMockData()) {
    return { categories: menuCategories, items: menuItems };
  }

  const [categories, items] = await Promise.all([
    repositories!.menuCategories.listByRestaurant(defaultRestaurantId),
    repositories!.menuItems.listByRestaurant(defaultRestaurantId)
  ]);

  return { categories, items };
}

export async function listMetrics() {
  if (shouldUseMockData()) {
    return metrics;
  }

  return repositories!.dailyMetrics.listByRestaurant(defaultRestaurantId);
}

export async function listStaffUsers() {
  if (shouldUseMockData()) {
    return staffUsers;
  }

  return repositories!.staffUsers.listByRestaurant(defaultRestaurantId);
}

export async function getRestaurantSettings() {
  if (shouldUseMockData()) {
    return settings;
  }

  const [result] = await repositories!.restaurantSettings.listByRestaurant(defaultRestaurantId);
  return result ?? settings;
}
