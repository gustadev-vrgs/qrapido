import { DocumentData, where } from "firebase/firestore";

import { COLLECTIONS } from "@/lib/data/constants/collections";
import { createOne, getCollection, getDocumentRef, patchOne, readMany, readOne, readPeriodPaginated } from "@/lib/data/helpers/firestore-io";
import { mapSession } from "@/lib/data/mappers/domain-mappers";
import { byRestaurantAndSessionToken, byRestaurantAndStatus, byRestaurantAndTable } from "@/lib/data/queries";
import { resolveContext, ServiceContext } from "@/lib/data/services/base-service";
import { createTableSessionPayloadSchema, updateTableSessionPayloadSchema } from "@/lib/schemas";
import type { CreateTableSessionPayload, TableSession, UpdateTableSessionPayload } from "@/lib/types/domain";
import { nowIsoString } from "@/lib/data/helpers/timestamps";

export class SessionsService {
  constructor(private readonly context?: ServiceContext) {}

  async listActiveByRestaurant(restaurantId: string): Promise<TableSession[]> {
    const { db } = resolveContext(this.context);
    return readMany(getCollection(db, COLLECTIONS.tableSessions), byRestaurantAndStatus(restaurantId, "active"), mapSession);
  }

  async listByRestaurantPeriod(restaurantId: string, startIso: string, endIso: string): Promise<TableSession[]> {
    const { db } = resolveContext(this.context);
    return readPeriodPaginated(getCollection(db, COLLECTIONS.tableSessions), restaurantId, "startedAt", startIso, endIso, mapSession);
  }

  async listByTable(restaurantId: string, tableId: string): Promise<TableSession[]> {
    const { db } = resolveContext(this.context);
    return readMany(getCollection(db, COLLECTIONS.tableSessions), byRestaurantAndTable(restaurantId, tableId), mapSession);
  }

  /** Attendances whose bill was closed on a restaurant day (field written since the split-payment change). */
  async listClosedOn(restaurantId: string, dateKey: string): Promise<TableSession[]> {
    const { db } = resolveContext(this.context);
    return readMany(getCollection(db, COLLECTIONS.tableSessions), [where("restaurantId", "==", restaurantId), where("closedDateKey", "==", dateKey)], mapSession);
  }

  /** Several attendances by id; missing or unreadable ones are skipped. */
  async getMany(ids: string[]): Promise<TableSession[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    const results = await Promise.all(unique.map((id) => this.getById(id).catch(() => null)));
    return results.filter((session): session is TableSession => session !== null);
  }

  async getById(id: string): Promise<TableSession> {
    const { db } = resolveContext(this.context);
    return readOne(getDocumentRef(db, COLLECTIONS.tableSessions, id), mapSession, "tableSession");
  }

  async getByToken(restaurantId: string, sessionToken: string): Promise<TableSession | null> {
    const { db } = resolveContext(this.context);
    const sessions = await readMany(
      getCollection(db, COLLECTIONS.tableSessions),
      byRestaurantAndSessionToken(restaurantId, sessionToken),
      mapSession
    );

    return sessions[0] ?? null;
  }

  async getByTokenGlobal(sessionToken: string): Promise<TableSession | null> {
    const { db } = resolveContext(this.context);
    const sessions = await readMany(getCollection(db, COLLECTIONS.tableSessions), [where("sessionToken", "==", sessionToken)], mapSession);

    return sessions[0] ?? null;
  }

  async create(payload: CreateTableSessionPayload): Promise<string> {
    const { db } = resolveContext(this.context);
    const parsed = createTableSessionPayloadSchema.parse(payload);

    return createOne<DocumentData>(getCollection(db, COLLECTIONS.tableSessions), {
      ...parsed,
      createdAt: nowIsoString(),
      updatedAt: nowIsoString()
    });
  }

  async update(id: string, payload: UpdateTableSessionPayload): Promise<void> {
    const { db } = resolveContext(this.context);
    const parsed = updateTableSessionPayloadSchema.parse(payload);

    await patchOne(getDocumentRef(db, COLLECTIONS.tableSessions, id), {
      ...parsed,
      updatedAt: nowIsoString(),
      lastActivityAt: parsed.lastActivityAt ?? nowIsoString()
    });
  }
}
