import { DocumentData } from "firebase/firestore";

import { COLLECTIONS } from "@/lib/data/constants/collections";
import { DataLayerError } from "@/lib/data/errors";
import { createOne, getCollection, getDocumentRef, patchOne, readMany, readOne } from "@/lib/data/helpers/firestore-io";
import { mapTable } from "@/lib/data/mappers/domain-mappers";
import { byRestaurantOrdered } from "@/lib/data/queries";
import { resolveContext, ServiceContext } from "@/lib/data/services/base-service";
import { createTablePayloadSchema, updateTablePayloadSchema } from "@/lib/schemas";
import type { CreateTablePayload, Table, UpdateTablePayload } from "@/lib/types/domain";
import { nowIsoString } from "@/lib/data/helpers/timestamps";

export class TablesService {
  constructor(private readonly context?: ServiceContext) {}

  async listByRestaurant(restaurantId: string): Promise<Table[]> {
    const { db } = resolveContext(this.context);
    return readMany(getCollection(db, COLLECTIONS.tables), byRestaurantOrdered(restaurantId, "number", "asc"), mapTable);
  }

  async getById(id: string): Promise<Table> {
    const { db } = resolveContext(this.context);
    return readOne(getDocumentRef(db, COLLECTIONS.tables, id), mapTable, "table");
  }

  async create(payload: CreateTablePayload): Promise<string> {
    const { db, scope } = resolveContext(this.context);
    if (scope !== "admin") {
      throw new DataLayerError("Only admin scope can create tables", "forbidden");
    }

    const parsed = createTablePayloadSchema.parse(payload);
    return createOne<DocumentData>(getCollection(db, COLLECTIONS.tables), {
      ...parsed,
      createdAt: nowIsoString(),
      updatedAt: nowIsoString()
    });
  }

  async update(id: string, payload: UpdateTablePayload): Promise<void> {
    const { db, scope } = resolveContext(this.context);
    if (scope !== "admin") {
      throw new DataLayerError("Only admin scope can update tables", "forbidden");
    }

    const parsed = updateTablePayloadSchema.parse(payload);
    await patchOne(getDocumentRef(db, COLLECTIONS.tables, id), {
      ...parsed,
      updatedAt: nowIsoString()
    });
  }
}
