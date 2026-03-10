import { DocumentData } from "firebase/firestore";

import { COLLECTIONS } from "@/lib/data/constants/collections";
import { DataLayerError } from "@/lib/data/errors";
import { createOne, getCollection, getDocumentRef, patchOne, readMany } from "@/lib/data/helpers/firestore-io";
import { mapMenuCategory, mapMenuItem } from "@/lib/data/mappers/domain-mappers";
import { byRestaurantOrdered } from "@/lib/data/queries";
import { resolveContext, ServiceContext } from "@/lib/data/services/base-service";
import {
  createMenuCategoryPayloadSchema,
  createMenuItemPayloadSchema,
  updateMenuCategoryPayloadSchema,
  updateMenuItemPayloadSchema
} from "@/lib/schemas";
import type {
  CreateMenuCategoryPayload,
  CreateMenuItemPayload,
  MenuCategory,
  MenuItem,
  UpdateMenuCategoryPayload,
  UpdateMenuItemPayload
} from "@/lib/types/domain";
import { nowIsoString } from "@/lib/data/helpers/timestamps";

export class MenuService {
  constructor(private readonly context?: ServiceContext) {}

  async listCategories(restaurantId: string): Promise<MenuCategory[]> {
    const { db } = resolveContext(this.context);
    return readMany(getCollection(db, COLLECTIONS.menuCategories), byRestaurantOrdered(restaurantId, "sortOrder"), mapMenuCategory);
  }

  async listItems(restaurantId: string): Promise<MenuItem[]> {
    const { db } = resolveContext(this.context);
    return readMany(getCollection(db, COLLECTIONS.menuItems), byRestaurantOrdered(restaurantId, "sortOrder"), mapMenuItem);
  }

  async createCategory(payload: CreateMenuCategoryPayload): Promise<string> {
    const { db, scope } = resolveContext(this.context);
    if (scope !== "admin") {
      throw new DataLayerError("Only admin scope can create menu categories", "forbidden");
    }

    const parsed = createMenuCategoryPayloadSchema.parse(payload);
    return createOne<DocumentData>(getCollection(db, COLLECTIONS.menuCategories), {
      ...parsed,
      createdAt: nowIsoString(),
      updatedAt: nowIsoString()
    });
  }

  async updateCategory(id: string, payload: UpdateMenuCategoryPayload): Promise<void> {
    const { db, scope } = resolveContext(this.context);
    if (scope !== "admin") {
      throw new DataLayerError("Only admin scope can update menu categories", "forbidden");
    }

    const parsed = updateMenuCategoryPayloadSchema.parse(payload);
    await patchOne(getDocumentRef(db, COLLECTIONS.menuCategories, id), { ...parsed, updatedAt: nowIsoString() });
  }

  async createItem(payload: CreateMenuItemPayload): Promise<string> {
    const { db, scope } = resolveContext(this.context);
    if (scope !== "admin") {
      throw new DataLayerError("Only admin scope can create menu items", "forbidden");
    }

    const parsed = createMenuItemPayloadSchema.parse(payload);
    return createOne<DocumentData>(getCollection(db, COLLECTIONS.menuItems), {
      ...parsed,
      createdAt: nowIsoString(),
      updatedAt: nowIsoString()
    });
  }

  async updateItem(id: string, payload: UpdateMenuItemPayload): Promise<void> {
    const { db, scope } = resolveContext(this.context);
    if (scope !== "admin") {
      throw new DataLayerError("Only admin scope can update menu items", "forbidden");
    }

    const parsed = updateMenuItemPayloadSchema.parse(payload);
    await patchOne(getDocumentRef(db, COLLECTIONS.menuItems, id), { ...parsed, updatedAt: nowIsoString() });
  }
}
