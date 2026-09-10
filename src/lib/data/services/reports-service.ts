import { DocumentData } from "firebase/firestore";

import { COLLECTIONS } from "@/lib/data/constants/collections";
import { DataLayerError } from "@/lib/data/errors";
import { createOne, getCollection, getDocumentRef, patchOne, readMany, readPeriodPaginated } from "@/lib/data/helpers/firestore-io";
import { mapDailyMetric, mapOrderEvent } from "@/lib/data/mappers/domain-mappers";
import { byRestaurantOrdered } from "@/lib/data/queries";
import { resolveContext, ServiceContext } from "@/lib/data/services/base-service";
import { createDailyMetricPayloadSchema, updateDailyMetricPayloadSchema } from "@/lib/schemas";
import type { CreateDailyMetricPayload, DailyMetric, OrderEvent, UpdateDailyMetricPayload } from "@/lib/types/domain";
import { nowIsoString } from "@/lib/data/helpers/timestamps";

export class ReportsService {
  constructor(private readonly context?: ServiceContext) {}

  async listDailyMetrics(restaurantId: string): Promise<DailyMetric[]> {
    const { db } = resolveContext(this.context);
    return readMany(getCollection(db, COLLECTIONS.dailyMetrics), byRestaurantOrdered(restaurantId, "dateKey", "desc"), mapDailyMetric);
  }

  async listOrderEventsPeriod(restaurantId: string, startIso: string, endIso: string): Promise<OrderEvent[]> {
    const { db } = resolveContext(this.context);
    return readPeriodPaginated(getCollection(db, COLLECTIONS.orderEvents), restaurantId, "createdAt", startIso, endIso, mapOrderEvent);
  }

  async createDailyMetric(payload: CreateDailyMetricPayload): Promise<string> {
    const { db, scope } = resolveContext(this.context);
    if (scope !== "admin") {
      throw new DataLayerError("Only admin scope can create reports", "forbidden");
    }

    const parsed = createDailyMetricPayloadSchema.parse(payload);
    return createOne<DocumentData>(getCollection(db, COLLECTIONS.dailyMetrics), {
      ...parsed,
      createdAt: nowIsoString(),
      updatedAt: nowIsoString()
    });
  }

  async updateDailyMetric(id: string, payload: UpdateDailyMetricPayload): Promise<void> {
    const { db, scope } = resolveContext(this.context);
    if (scope !== "admin") {
      throw new DataLayerError("Only admin scope can update reports", "forbidden");
    }

    const parsed = updateDailyMetricPayloadSchema.parse(payload);
    await patchOne(getDocumentRef(db, COLLECTIONS.dailyMetrics, id), { ...parsed, updatedAt: nowIsoString() });
  }
}
