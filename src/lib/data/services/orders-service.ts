import { where } from "firebase/firestore";

import { COLLECTIONS } from "@/lib/data/constants/collections";
import { getCollection, getDocumentRef, readMany, readOne, readPeriodPaginated } from "@/lib/data/helpers/firestore-io";
import { mapOrder } from "@/lib/data/mappers/domain-mappers";
import { byRestaurant, byRestaurantAndTable } from "@/lib/data/queries";
import { resolveContext, ServiceContext } from "@/lib/data/services/base-service";
import type { Order } from "@/lib/types/domain";

export const ACTIVE_ORDER_STATUSES = ["received", "confirmed", "in_preparation", "ready"] as const;

function newestFirst(a: Order, b: Order): number {
  return b.receivedAt.localeCompare(a.receivedAt);
}

/**
 * Read-only access for the panel. Orders are created and moved only by the
 * server APIs (/api/public/order and /api/admin/order/transition); the
 * Firestore rules reject direct writes, so no write helpers live here.
 */
export class OrdersService {
  constructor(private readonly context?: ServiceContext) {}

  /** Orders of one restaurant-local day, equality-only query (no composite index). */
  async listByDateKey(restaurantId: string, dateKey: string): Promise<Order[]> {
    const { db } = resolveContext(this.context);
    const orders = await readMany(getCollection(db, COLLECTIONS.orders), [...byRestaurant(restaurantId), where("dateKey", "==", dateKey)], mapOrder);
    return orders.sort(newestFirst);
  }

  /** Orders still in the kitchen/floor flow, whatever day they were placed. */
  async listActive(restaurantId: string): Promise<Order[]> {
    const { db } = resolveContext(this.context);
    const groups = await Promise.all(ACTIVE_ORDER_STATUSES.map((status) => readMany(getCollection(db, COLLECTIONS.orders), [...byRestaurant(restaurantId), where("status", "==", status)], mapOrder)));
    return groups.flat().sort(newestFirst);
  }

  /** Date range for reports. Needs the (restaurantId, receivedAt) composite index. */
  async listByRestaurantPeriod(restaurantId: string, startIso: string, endIso: string): Promise<Order[]> {
    const { db } = resolveContext(this.context);
    return readPeriodPaginated(getCollection(db, COLLECTIONS.orders), restaurantId, "receivedAt", startIso, endIso, mapOrder);
  }

  async listByTable(restaurantId: string, tableId: string): Promise<Order[]> {
    const { db } = resolveContext(this.context);
    const orders = await readMany(getCollection(db, COLLECTIONS.orders), byRestaurantAndTable(restaurantId, tableId), mapOrder);
    return orders.sort(newestFirst);
  }

  async getById(id: string): Promise<Order> {
    const { db } = resolveContext(this.context);
    return readOne(getDocumentRef(db, COLLECTIONS.orders, id), mapOrder, "order");
  }
}
