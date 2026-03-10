import { z } from "zod";
import {
  actorTypes,
  orderEventTypes,
  orderStatuses,
  sessionStatuses,
  staffRoles,
  tableStatuses,
  type DailyMetric,
  type MenuCategory,
  type MenuItem,
  type Order,
  type OrderEvent,
  type OrderItem,
  type Restaurant,
  type RestaurantSettings,
  type StaffUser,
  type Table,
  type TableSession
} from "@/lib/types/domain";

const isoDateString = z.string().datetime({ offset: true });

const baseEntitySchema = z.object({
  id: z.string().min(1),
  restaurantId: z.string().min(1),
  createdAt: isoDateString,
  updatedAt: isoDateString
});

export const restaurantSchema = baseEntitySchema.extend({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(80),
  isActive: z.boolean()
});

export const staffUserSchema = baseEntitySchema.extend({
  uid: z.string().min(1),
  email: z.string().email(),
  role: z.enum(staffRoles),
  displayName: z.string().min(2).max(80),
  isActive: z.boolean(),
  lastLoginAt: isoDateString.optional()
});

export const tableSchema = baseEntitySchema.extend({
  number: z.string().min(1).max(30),
  capacity: z.number().int().min(1).max(20),
  status: z.enum(tableStatuses),
  activeSessionCount: z.number().int().min(0)
});

export const tableSessionSchema = baseEntitySchema.extend({
  tableId: z.string().min(1),
  customerName: z.string().max(40).optional(),
  peopleCount: z.number().int().min(1).max(20),
  status: z.enum(sessionStatuses),
  expiresAt: isoDateString,
  token: z.string().min(8)
});

export const menuCategorySchema = baseEntitySchema.extend({
  name: z.string().min(2).max(80),
  description: z.string().max(240),
  sortOrder: z.number().int().min(0),
  isActive: z.boolean()
});

export const menuItemSchema = baseEntitySchema.extend({
  categoryId: z.string().min(1),
  name: z.string().min(2).max(120),
  description: z.string().max(400),
  priceInCents: z.number().int().positive(),
  sortOrder: z.number().int().min(0),
  isAvailable: z.boolean()
});

export const orderItemSchema = z.object({
  menuItemId: z.string().min(1),
  nameSnapshot: z.string().min(2).max(120),
  unitPriceInCents: z.number().int().positive(),
  quantity: z.number().int().min(1).max(99),
  notes: z.string().max(180).optional()
});

export const orderSchema = baseEntitySchema.extend({
  tableId: z.string().min(1),
  sessionId: z.string().min(1),
  customerName: z.string().max(40).optional(),
  status: z.enum(orderStatuses),
  items: z.array(orderItemSchema).min(1),
  totalInCents: z.number().int().nonnegative(),
  dedupeKey: z.string().min(8)
});

export const orderEventSchema = baseEntitySchema.extend({
  orderId: z.string().min(1),
  sessionId: z.string().min(1),
  eventType: z.enum(orderEventTypes),
  actor: z.enum(actorTypes),
  metadata: z.record(z.string())
});

export const restaurantSettingsSchema = baseEntitySchema.extend({
  timezone: z.string().min(2),
  currency: z.string().length(3),
  maxOrdersPerMinute: z.number().int().min(1).max(120),
  sessionTtlMinutes: z.number().int().min(10).max(720),
  allowWaiterCall: z.boolean()
});

export const dailyMetricSchema = baseEntitySchema.extend({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  revenueInCents: z.number().int().nonnegative(),
  orderCount: z.number().int().nonnegative(),
  occupancyRate: z.number().min(0).max(100),
  avgTicketInCents: z.number().int().nonnegative()
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});


export const createTableSchema = z.object({
  number: z.string().min(1).max(30),
  capacity: z.number().int().min(1).max(20),
  status: z.enum(tableStatuses).default("active")
});

export const createSessionSchema = z.object({
  tableId: z.string().min(1),
  customerName: z.string().max(40).optional(),
  peopleCount: z.number().int().min(1).max(20)
});

export const orderRequestSchema = z.object({
  sessionId: z.string().min(1),
  itemIds: z.array(z.string().min(1)).min(1),
  notes: z.string().max(200).optional(),
  dedupeKey: z.string().min(8)
});

export const parseWithSchema = <T>(schema: z.ZodType<T>, input: unknown, entity: string): T => {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid ${entity}: ${parsed.error.message}`);
  }
  return parsed.data;
};

export const parseRestaurant = (input: unknown): Restaurant => parseWithSchema(restaurantSchema, input, "restaurant");
export const parseStaffUser = (input: unknown): StaffUser => parseWithSchema(staffUserSchema, input, "staffUser");
export const parseTable = (input: unknown): Table => parseWithSchema(tableSchema, input, "table");
export const parseTableSession = (input: unknown): TableSession => parseWithSchema(tableSessionSchema, input, "tableSession");
export const parseMenuCategory = (input: unknown): MenuCategory => parseWithSchema(menuCategorySchema, input, "menuCategory");
export const parseMenuItem = (input: unknown): MenuItem => parseWithSchema(menuItemSchema, input, "menuItem");
export const parseOrderItem = (input: unknown): OrderItem => parseWithSchema(orderItemSchema, input, "orderItem");
export const parseOrder = (input: unknown): Order => parseWithSchema(orderSchema, input, "order");
export const parseOrderEvent = (input: unknown): OrderEvent => parseWithSchema(orderEventSchema, input, "orderEvent");
export const parseRestaurantSettings = (input: unknown): RestaurantSettings =>
  parseWithSchema(restaurantSettingsSchema, input, "restaurantSettings");
export const parseDailyMetric = (input: unknown): DailyMetric => parseWithSchema(dailyMetricSchema, input, "dailyMetric");

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateTableInput = z.infer<typeof createTableSchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type OrderRequestInput = z.infer<typeof orderRequestSchema>;
