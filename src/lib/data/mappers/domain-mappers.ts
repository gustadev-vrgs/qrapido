import type { DocumentData } from "firebase/firestore";

import {
  dailyMetricSchema,
  menuCategorySchema,
  menuItemSchema,
  orderSchema,
  restaurantSettingsSchema,
  staffUserSchema,
  tableSchema,
  tableSessionSchema
} from "@/lib/schemas";
import type { DailyMetric, MenuCategory, MenuItem, Order, RestaurantSettings, StaffUser, Table, TableSession } from "@/lib/types/domain";
import { ensureIsoTimestamp } from "@/lib/data/helpers/serialization";
import { parseWithSchema } from "@/lib/data/mappers/common";

export function mapStaffUser(id: string, data: DocumentData): StaffUser {
  return parseWithSchema(staffUserSchema, id, data, "staffUser");
}

export function mapTable(id: string, data: DocumentData): Table {
  return parseWithSchema(tableSchema, id, data, "table");
}

export function mapSession(id: string, data: DocumentData): TableSession {
  const normalized = {
    ...data,
    startedAt: ensureIsoTimestamp(data.startedAt),
    expiresAt: ensureIsoTimestamp(data.expiresAt),
    closedAt: ensureIsoTimestamp(data.closedAt),
    lastActivityAt: ensureIsoTimestamp(data.lastActivityAt)
  };

  return parseWithSchema(tableSessionSchema, id, normalized, "tableSession");
}

export function mapMenuCategory(id: string, data: DocumentData): MenuCategory {
  return parseWithSchema(menuCategorySchema, id, data, "menuCategory");
}

export function mapMenuItem(id: string, data: DocumentData): MenuItem {
  return parseWithSchema(menuItemSchema, id, data, "menuItem");
}

export function mapOrder(id: string, data: DocumentData): Order {
  const normalized = {
    ...data,
    receivedAt: ensureIsoTimestamp(data.receivedAt),
    deliveredAt: ensureIsoTimestamp(data.deliveredAt),
    cancelledAt: ensureIsoTimestamp(data.cancelledAt)
  };

  return parseWithSchema(orderSchema, id, normalized, "order");
}

export function mapDailyMetric(id: string, data: DocumentData): DailyMetric {
  return parseWithSchema(dailyMetricSchema, id, data, "dailyMetric");
}

export function mapSettings(id: string, data: DocumentData): RestaurantSettings {
  return parseWithSchema(restaurantSettingsSchema, id, data, "restaurantSettings");
}
