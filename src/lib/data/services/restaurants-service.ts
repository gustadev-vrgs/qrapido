import { DocumentData } from "firebase/firestore";

import { COLLECTIONS } from "@/lib/data/constants/collections";
import { createOne, getCollection, getDocumentRef, patchOne, readMany, readOne } from "@/lib/data/helpers/firestore-io";
import { mapRestaurant } from "@/lib/data/mappers/domain-mappers";
import { byRestaurant } from "@/lib/data/queries";
import { resolveContext, ServiceContext } from "@/lib/data/services/base-service";
import { createRestaurantPayloadSchema, updateRestaurantPayloadSchema } from "@/lib/schemas";
import type { CreateRestaurantPayload, Restaurant, UpdateRestaurantPayload } from "@/lib/types/domain";
import { nowIsoString } from "@/lib/data/helpers/timestamps";

export class RestaurantsService {
  constructor(private readonly context?: ServiceContext) {}

  async list(): Promise<Restaurant[]> {
    const { db } = resolveContext(this.context);
    return readMany(getCollection(db, COLLECTIONS.restaurants), [], mapRestaurant);
  }

  async getById(id: string): Promise<Restaurant> {
    const { db } = resolveContext(this.context);
    return readOne(getDocumentRef(db, COLLECTIONS.restaurants, id), mapRestaurant, "restaurant");
  }

  /**
   * The restaurant document id is the restaurantId (that is what the Firestore
   * rules check). Older setups created it with a random id, so a field query is
   * the fallback; rules that predate this change may deny that query, which is
   * treated as "not found" instead of breaking the screen.
   */
  async getByRestaurantId(restaurantId: string): Promise<Restaurant | null> {
    const { db } = resolveContext(this.context);
    const direct = await readOne(getDocumentRef(db, COLLECTIONS.restaurants, restaurantId), mapRestaurant, "restaurant").catch(() => null);
    if (direct) return direct;
    const restaurants = await readMany(getCollection(db, COLLECTIONS.restaurants), byRestaurant(restaurantId), mapRestaurant).catch(() => []);
    return restaurants[0] ?? null;
  }

  async create(payload: CreateRestaurantPayload): Promise<string> {
    const { db } = resolveContext(this.context);
    const parsed = createRestaurantPayloadSchema.parse(payload);

    return createOne<DocumentData>(getCollection(db, COLLECTIONS.restaurants), {
      ...parsed,
      createdAt: nowIsoString(),
      updatedAt: nowIsoString()
    });
  }

  async update(id: string, payload: UpdateRestaurantPayload): Promise<void> {
    const { db } = resolveContext(this.context);
    const parsed = updateRestaurantPayloadSchema.parse(payload);

    await patchOne(getDocumentRef(db, COLLECTIONS.restaurants, id), {
      ...parsed,
      updatedAt: nowIsoString()
    });
  }
}
