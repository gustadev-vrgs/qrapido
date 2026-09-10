import type { DocumentData } from "firebase/firestore";

import {
  dailyMetricSchema,
  menuCategorySchema,
  menuItemSchema,
  restaurantSchema,
  orderSchema,
  orderEventSchema,
  restaurantSettingsSchema,
  staffUserSchema,
  tableSchema,
  tableSessionSchema
} from "@/lib/schemas";
import type { DailyMetric, MenuCategory, MenuItem, Order, OrderEvent, Restaurant, RestaurantSettings, StaffUser, Table, TableSession } from "@/lib/types/domain";
import { ensureIsoTimestamp } from "@/lib/data/helpers/serialization";
import { parseWithSchema } from "@/lib/data/mappers/common";

export function mapStaffUser(id: string, data: DocumentData): StaffUser {
  return parseWithSchema(staffUserSchema, id, data, "staffUser");
}

export function mapRestaurant(id: string, data: DocumentData): Restaurant {
  return parseWithSchema(restaurantSchema, id, data, "restaurant");
}

export function mapTable(id: string, data: DocumentData): Table {
  return parseWithSchema(tableSchema, id, data, "table") as Table;
}

export function mapSession(id: string, data: DocumentData): TableSession {
  const normalized = {
    ...data,
    startedAt: ensureIsoTimestamp(data.startedAt),
    expiresAt: ensureIsoTimestamp(data.expiresAt),
    closedAt: ensureIsoTimestamp(data.closedAt),
    lastActivityAt: ensureIsoTimestamp(data.lastActivityAt)
  };

  return parseWithSchema(tableSessionSchema, id, normalized, "tableSession") as TableSession;
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

  // ZodDefault accepts `undefined` as input so Zod exposes that optionality in
  // the schema's input-facing inferred type. `safeParse` has already converted
  // defaults and validated the output at this point; the domain mapper exposes
  // the post-parse contract, in which sessionToken and duplicateGuardHash are
  // always strings.
  return parseWithSchema(orderSchema, id, normalized, "order") as Order;
}

export function mapOrderEvent(id: string, data: DocumentData): OrderEvent {
  const normalized = { ...data, createdAt: ensureIsoTimestamp(data.createdAt) };
  return parseWithSchema(orderEventSchema, id, normalized, "orderEvent");
}

export function mapDailyMetric(id: string, data: DocumentData): DailyMetric {
  return parseWithSchema(dailyMetricSchema, id, data, "dailyMetric");
}

export function mapSettings(id: string, data: DocumentData): RestaurantSettings {
  // Settings defaults are likewise materialized by safeParse before returning.
  return parseWithSchema(restaurantSettingsSchema, id, data, "restaurantSettings") as RestaurantSettings;
}
