import { DocumentData } from "firebase/firestore";

import { COLLECTIONS } from "@/lib/data/constants/collections";
import { createOne, getCollection, getDocumentRef, patchOne, readMany, readOne } from "@/lib/data/helpers/firestore-io";
import { mapOrder } from "@/lib/data/mappers/domain-mappers";
import { byRestaurantOrdered, byRestaurantAndSessionToken, byRestaurantAndTable } from "@/lib/data/queries";
import { resolveContext, ServiceContext } from "@/lib/data/services/base-service";
import { createOrderPayloadSchema, updateOrderPayloadSchema } from "@/lib/schemas";
import type { CreateOrderPayload, Order, UpdateOrderPayload } from "@/lib/types/domain";
import { nowIsoString } from "@/lib/data/helpers/timestamps";

export class OrdersService {
  constructor(private readonly context?: ServiceContext) {}

  async listByRestaurant(restaurantId: string): Promise<Order[]> {
    const { db } = resolveContext(this.context);
    return readMany(getCollection(db, COLLECTIONS.orders), byRestaurantOrdered(restaurantId, "receivedAt", "desc"), mapOrder);
  }

  async listByTable(restaurantId: string, tableId: string): Promise<Order[]> {
    const { db } = resolveContext(this.context);
    return readMany(getCollection(db, COLLECTIONS.orders), byRestaurantAndTable(restaurantId, tableId), mapOrder);
  }

  async listBySessionToken(restaurantId: string, sessionToken: string): Promise<Order[]> {
    const { db } = resolveContext(this.context);
    return readMany(getCollection(db, COLLECTIONS.orders), byRestaurantAndSessionToken(restaurantId, sessionToken), mapOrder);
  }

  async getById(id: string): Promise<Order> {
    const { db } = resolveContext(this.context);
    return readOne(getDocumentRef(db, COLLECTIONS.orders, id), mapOrder, "order");
  }

  async create(payload: CreateOrderPayload): Promise<string> {
    const { db } = resolveContext(this.context);
    const parsed = createOrderPayloadSchema.parse(payload);

    return createOne<DocumentData>(getCollection(db, COLLECTIONS.orders), {
      ...parsed,
      createdAt: nowIsoString(),
      updatedAt: nowIsoString()
    });
  }

  async update(id: string, payload: UpdateOrderPayload): Promise<void> {
    const { db } = resolveContext(this.context);
    const parsed = updateOrderPayloadSchema.parse(payload);

    const currentOrder = await this.getById(id);

    await patchOne(getDocumentRef(db, COLLECTIONS.orders, id), {
      ...parsed,
      updatedAt: nowIsoString()
    });

    if (parsed.status && parsed.status !== currentOrder.status) {
      await createOne<DocumentData>(getCollection(db, COLLECTIONS.orderEvents), {
        restaurantId: currentOrder.restaurantId,
        orderId: currentOrder.id,
        tableId: currentOrder.tableId,
        sessionId: currentOrder.sessionId,
        type: parsed.status === "cancelled" ? "order_cancelled" : "order_updated",
        actorType: "staff",
        actorId: null,
        message: parsed.status === "cancelled" ? "Pedido cancelado pelo painel operacional" : "Pedido atualizado no painel operacional",
        metadata: {
          previousStatus: currentOrder.status,
          nextStatus: parsed.status
        },
        createdAt: nowIsoString()
      });
    }
  }
}
