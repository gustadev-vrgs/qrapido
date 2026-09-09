import { z } from "zod";
import {
  ACTOR_TYPES,
  ORDER_EVENT_TYPES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  SESSION_STATUSES,
  TABLE_STATUSES,
  USER_ROLES
} from "@/lib/types/domain";

const isoDateTimeSchema = z.string().datetime({ offset: true });
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateKey deve estar em formato YYYY-MM-DD");
const entityIdSchema = z.string().min(1);
const moneySchema = z.number().nonnegative().multipleOf(0.01);

export const baseEntitySchema = z.object({
  id: entityIdSchema,
  restaurantId: entityIdSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export const tableStatusSchema = z.enum(TABLE_STATUSES);
export const sessionStatusSchema = z.enum(SESSION_STATUSES);
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export const userRoleSchema = z.enum(USER_ROLES);
export const orderEventTypeSchema = z.enum(ORDER_EVENT_TYPES);
export const actorTypeSchema = z.enum(ACTOR_TYPES);

export const restaurantSchema = baseEntitySchema.extend({
  restaurantId: entityIdSchema,
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/),
  description: z.string().max(600),
  address: z.string().min(8).max(180),
  phone: z.string().min(8).max(20),
  logoUrl: z.string().url().nullable(),
  isActive: z.boolean()
});

export const staffUserSchema = baseEntitySchema.extend({
  uid: z.string().min(6),
  name: z.string().min(2).max(80),
  email: z.string().email(),
  role: userRoleSchema,
  isActive: z.boolean()
});

export const tableSchema = baseEntitySchema.extend({
  number: z.number().int().positive(),
  label: z.string().min(1).max(30),
  status: tableStatusSchema,
  capacity: z.number().int().positive().max(20),
  currentPeopleCount: z.number().int().min(0).max(40),
  activeSessionLimit: z.number().int().positive().max(40),
  activeSessionCount: z.number().int().min(0).max(5),
  currentSessionGroupId: entityIdSchema.nullable(),
  pinCode: z.string().length(4).nullable(),
  qrCodeValue: z.string().min(8).max(300),
  publicToken: z.string().min(16).max(128).default("legacy-token-placeholder"),
  isActive: z.boolean().default(true),
  openedAt: isoDateTimeSchema.nullable(),
  closedAt: isoDateTimeSchema.nullable()
});

export const tableSessionSchema = baseEntitySchema.extend({
  tableId: entityIdSchema,
  tableNumber: z.number().int().positive(),
  sessionToken: z.string().min(16).max(128),
  sessionLabel: z.string().min(1).max(60),
  customerName: z.string().min(2).max(80).nullable(),
  status: sessionStatusSchema,
  deviceFingerprint: z.string().min(8).max(128).nullable(),
  startedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  closedAt: isoDateTimeSchema.nullable(),
  lastActivityAt: isoDateTimeSchema,
  requestCountWindow: z.number().int().min(0),
  peopleCount: z.number().int().positive().default(1),
  maxOrdersAllowed: z.number().int().positive().default(1),
  orderLimitEnabled: z.boolean().default(true),
  completedOrdersCount: z.number().int().min(0).default(0),
  openedByStaffId: entityIdSchema.nullable().default(null),
  notes: z.string().max(500).nullable().default(null)
});

export const menuCategorySchema = baseEntitySchema.extend({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/),
  description: z.string().max(400),
  sortOrder: z.number().int().nonnegative(),
  isActive: z.boolean()
});

export const menuItemSchema = baseEntitySchema.extend({
  categoryId: entityIdSchema,
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/),
  description: z.string().max(600),
  price: moneySchema,
  imageUrl: z.string().url().nullable(),
  preparationTimeMinutes: z.number().int().positive().max(180),
  isActive: z.boolean(),
  isAvailable: z.boolean(),
  isFeatured: z.boolean(),
  sortOrder: z.number().int().nonnegative()
});

export const orderItemSchema = z.object({
  menuItemId: entityIdSchema,
  nameSnapshot: z.string().min(2).max(120),
  priceSnapshot: moneySchema,
  quantity: z.number().int().positive().max(30),
  notes: z.string().max(280).nullable(),
  total: moneySchema
});

export const orderSchema = baseEntitySchema.extend({
  tableId: entityIdSchema,
  tableNumber: z.number().int().positive(),
  sessionId: entityIdSchema,
  sessionToken: z.string().min(16).max(128),
  customerName: z.string().min(2).max(80).nullable(),
  items: z.array(orderItemSchema).min(1),
  subtotal: moneySchema,
  serviceFee: moneySchema,
  total: moneySchema,
  paymentMethod: paymentMethodSchema,
  status: orderStatusSchema,
  notes: z.string().max(500).nullable(),
  duplicateGuardHash: z.string().min(8).max(128),
  receivedAt: isoDateTimeSchema,
  deliveredAt: isoDateTimeSchema.nullable(),
  cancelledAt: isoDateTimeSchema.nullable(),
  cancellationReason: z.string().max(300).nullable().optional(),
  quotaReleasedAt: isoDateTimeSchema.nullable().optional()
});

export const orderEventSchema = z.object({
  id: entityIdSchema,
  restaurantId: entityIdSchema,
  orderId: entityIdSchema,
  tableId: entityIdSchema,
  sessionId: entityIdSchema,
  type: orderEventTypeSchema,
  actorType: actorTypeSchema,
  actorId: entityIdSchema.nullable(),
  message: z.string().min(1).max(280),
  metadata: z.record(z.unknown()),
  createdAt: isoDateTimeSchema
});

export const businessHoursDaySchema = z.object({
  isOpen: z.boolean(),
  open: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  close: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
});

export const businessHoursSchema = z.object({
  monday: businessHoursDaySchema,
  tuesday: businessHoursDaySchema,
  wednesday: businessHoursDaySchema,
  thursday: businessHoursDaySchema,
  friday: businessHoursDaySchema,
  saturday: businessHoursDaySchema,
  sunday: businessHoursDaySchema
});

export const restaurantSettingsSchema = baseEntitySchema.extend({
  acceptedPaymentMethods: z.array(paymentMethodSchema).min(1),
  pixKey: z.string().max(140).nullable(),
  pixReceiverName: z.string().max(120).nullable().optional(),
  pixReceiverCity: z.string().max(80).nullable().optional(),
  pixInstructions: z.string().max(240).nullable().optional(),
  businessHours: businessHoursSchema,
  antiSpamWindowSeconds: z.number().int().positive().max(3600),
  maxOrdersPerWindow: z.number().int().positive().max(20),
  defaultSessionDurationMinutes: z.number().int().positive().max(360),
  allowSessionPin: z.boolean(),
  requireCustomerName: z.boolean(),
  waiterCallEnabled: z.boolean(),
  billRequestEnabled: z.boolean()
});

export const topItemMetricSchema = z.object({
  menuItemId: entityIdSchema,
  nameSnapshot: z.string().min(2).max(120),
  quantity: z.number().int().positive(),
  revenue: moneySchema
});

export const dailyMetricSchema = baseEntitySchema.extend({
  dateKey: isoDateSchema,
  totalRevenue: moneySchema,
  totalOrders: z.number().int().nonnegative(),
  cancelledOrders: z.number().int().nonnegative(),
  averageTicket: moneySchema,
  averagePreparationMinutes: z.number().nonnegative(),
  occupiedTablesPeak: z.number().int().nonnegative(),
  topItems: z.array(topItemMetricSchema)
});

export const createRestaurantPayloadSchema = restaurantSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const updateRestaurantPayloadSchema = createRestaurantPayloadSchema.partial();

export const createStaffUserPayloadSchema = staffUserSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const updateStaffUserPayloadSchema = createStaffUserPayloadSchema.omit({ uid: true, restaurantId: true }).partial();

export const createTablePayloadSchema = tableSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const updateTablePayloadSchema = createTablePayloadSchema.omit({ restaurantId: true }).partial();

export const createTableSessionPayloadSchema = tableSessionSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const updateTableSessionPayloadSchema = createTableSessionPayloadSchema
  .omit({ restaurantId: true, tableId: true, sessionToken: true })
  .partial();

export const createMenuCategoryPayloadSchema = menuCategorySchema.omit({ id: true, createdAt: true, updatedAt: true });
export const updateMenuCategoryPayloadSchema = createMenuCategoryPayloadSchema.omit({ restaurantId: true }).partial();

export const createMenuItemPayloadSchema = menuItemSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const updateMenuItemPayloadSchema = createMenuItemPayloadSchema.omit({ restaurantId: true }).partial();

export const createOrderPayloadSchema = orderSchema.omit({ id: true, createdAt: true, updatedAt: true, deliveredAt: true, cancelledAt: true });
export const updateOrderPayloadSchema = createOrderPayloadSchema
  .omit({ restaurantId: true, tableId: true, sessionId: true })
  .partial()
  .extend({ deliveredAt: isoDateTimeSchema.nullable(), cancelledAt: isoDateTimeSchema.nullable() });

export const createOrderEventPayloadSchema = orderEventSchema.omit({ id: true, createdAt: true });

export const createRestaurantSettingsPayloadSchema = restaurantSettingsSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const updateRestaurantSettingsPayloadSchema = createRestaurantSettingsPayloadSchema.omit({ restaurantId: true }).partial();

export const createDailyMetricPayloadSchema = dailyMetricSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const updateDailyMetricPayloadSchema = createDailyMetricPayloadSchema.omit({ restaurantId: true, dateKey: true }).partial();
