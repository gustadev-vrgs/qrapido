import { DocumentData, where } from "firebase/firestore";

import { COLLECTIONS } from "@/lib/data/constants/collections";
import { DataLayerError } from "@/lib/data/errors";
import { createOne, getCollection, getDocumentRef, patchOne, readMany, readOne } from "@/lib/data/helpers/firestore-io";
import { nowIsoString } from "@/lib/data/helpers/timestamps";
import { mapStaffUser } from "@/lib/data/mappers/domain-mappers";
import { resolveContext, ServiceContext } from "@/lib/data/services/base-service";
import { byRestaurant } from "@/lib/data/queries";
import { createStaffUserPayloadSchema, updateStaffUserPayloadSchema } from "@/lib/schemas";
import type { CreateStaffUserPayload, StaffUser, UpdateStaffUserPayload } from "@/lib/types/domain";

export class AuthService {
  constructor(private readonly context?: ServiceContext) {}

  async listStaffByRestaurant(restaurantId: string): Promise<StaffUser[]> {
    const { db } = resolveContext(this.context);
    return readMany(getCollection(db, COLLECTIONS.staffUsers), byRestaurant(restaurantId), mapStaffUser);
  }

  async getStaffById(id: string): Promise<StaffUser> {
    const { db } = resolveContext(this.context);
    return readOne(getDocumentRef(db, COLLECTIONS.staffUsers, id), mapStaffUser, "staffUser");
  }

  async getStaffByUid(uid: string, restaurantId: string): Promise<StaffUser | null> {
    const { db } = resolveContext(this.context);
    const users = await readMany(
      getCollection(db, COLLECTIONS.staffUsers),
      [where("uid", "==", uid), where("restaurantId", "==", restaurantId)],
      mapStaffUser
    );

    return users[0] ?? null;
  }

  async createStaff(payload: CreateStaffUserPayload): Promise<string> {
    const { db, scope } = resolveContext(this.context);
    if (scope !== "admin") {
      throw new DataLayerError("Only admin scope can create staff users", "forbidden");
    }

    const parsed = createStaffUserPayloadSchema.parse(payload);
    return createOne<DocumentData>(getCollection(db, COLLECTIONS.staffUsers), {
      ...parsed,
      createdAt: nowIsoString(),
      updatedAt: nowIsoString()
    });
  }

  async updateStaff(id: string, payload: UpdateStaffUserPayload): Promise<void> {
    const { db, scope } = resolveContext(this.context);
    if (scope !== "admin") {
      throw new DataLayerError("Only admin scope can update staff users", "forbidden");
    }

    const parsed = updateStaffUserPayloadSchema.parse(payload);
    await patchOne(getDocumentRef(db, COLLECTIONS.staffUsers, id), { ...parsed, updatedAt: nowIsoString() });
  }
}
