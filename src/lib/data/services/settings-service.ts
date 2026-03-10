import { DocumentData } from "firebase/firestore";

import { COLLECTIONS } from "@/lib/data/constants/collections";
import { DataLayerError } from "@/lib/data/errors";
import { createOne, getCollection, getDocumentRef, patchOne, readMany, readOne } from "@/lib/data/helpers/firestore-io";
import { mapSettings } from "@/lib/data/mappers/domain-mappers";
import { byRestaurant } from "@/lib/data/queries";
import { resolveContext, ServiceContext } from "@/lib/data/services/base-service";
import { createRestaurantSettingsPayloadSchema, updateRestaurantSettingsPayloadSchema } from "@/lib/schemas";
import type { CreateRestaurantSettingsPayload, RestaurantSettings, UpdateRestaurantSettingsPayload } from "@/lib/types/domain";
import { nowIsoString } from "@/lib/data/helpers/timestamps";

export class SettingsService {
  constructor(private readonly context?: ServiceContext) {}

  async getById(id: string): Promise<RestaurantSettings> {
    const { db } = resolveContext(this.context);
    return readOne(getDocumentRef(db, COLLECTIONS.restaurantSettings, id), mapSettings, "restaurantSettings");
  }

  async listByRestaurant(restaurantId: string): Promise<RestaurantSettings[]> {
    const { db } = resolveContext(this.context);
    return readMany(getCollection(db, COLLECTIONS.restaurantSettings), byRestaurant(restaurantId), mapSettings);
  }

  async create(payload: CreateRestaurantSettingsPayload): Promise<string> {
    const { db, scope } = resolveContext(this.context);
    if (scope !== "admin") {
      throw new DataLayerError("Only admin scope can create settings", "forbidden");
    }

    const parsed = createRestaurantSettingsPayloadSchema.parse(payload);
    return createOne<DocumentData>(getCollection(db, COLLECTIONS.restaurantSettings), {
      ...parsed,
      createdAt: nowIsoString(),
      updatedAt: nowIsoString()
    });
  }

  async update(id: string, payload: UpdateRestaurantSettingsPayload): Promise<void> {
    const { db, scope } = resolveContext(this.context);
    if (scope !== "admin") {
      throw new DataLayerError("Only admin scope can update settings", "forbidden");
    }

    const parsed = updateRestaurantSettingsPayloadSchema.parse(payload);
    await patchOne(getDocumentRef(db, COLLECTIONS.restaurantSettings, id), {
      ...parsed,
      updatedAt: nowIsoString()
    });
  }
}
