import { NextRequest, NextResponse } from "next/server";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { ADMIN_ROLES, requireStaffRequest } from "@/lib/server/admin-auth";
import { withApiErrors } from "@/lib/server/api-errors";
import { invalidateRestaurantPublicData } from "@/lib/server/public-cache";
import { SAMPLE_CATEGORIES, SAMPLE_IMAGE_PREFIX, SAMPLE_ITEMS, slugify } from "@/lib/server/sample-menu";

type Db = any;
const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();

/**
 * Adds the starter menu (5 pratos feitos + bebidas, with pictures). Safe to repeat:
 * categories and items that already exist by name are kept as they are.
 */
async function handler(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, ADMIN_ROLES);
  if (staff instanceof NextResponse) return staff;
  const restaurantId = staff.staffUser.restaurantId;
  const db = getAdminFirestore() as Db;
  const now = new Date().toISOString();
  const [categorySnap, itemSnap] = await Promise.all([
    db.collection("menuCategories").where("restaurantId", "==", restaurantId).get(),
    db.collection("menuItems").where("restaurantId", "==", restaurantId).get()
  ]);
  const categoryIds = new Map<string, string>(categorySnap.docs.map((doc: Db) => [normalize(doc.data().name), doc.id]));
  const existingItems = new Set(itemSnap.docs.map((doc: Db) => normalize(doc.data().name)));
  let nextCategoryOrder = categorySnap.docs.reduce((max: number, doc: Db) => Math.max(max, Number(doc.data().sortOrder ?? 0) + 1), 0);
  let nextItemOrder = itemSnap.docs.reduce((max: number, doc: Db) => Math.max(max, Number(doc.data().sortOrder ?? 0) + 1), 0);

  let createdCategories = 0;
  for (const category of SAMPLE_CATEGORIES) {
    if (categoryIds.has(normalize(category.name))) continue;
    const ref = db.collection("menuCategories").doc();
    await ref.set({ restaurantId, name: category.name, slug: slugify(category.name), description: category.description, sortOrder: nextCategoryOrder++, isActive: true, createdAt: now, updatedAt: now });
    categoryIds.set(normalize(category.name), ref.id);
    createdCategories += 1;
  }

  let createdItems = 0;
  for (const item of SAMPLE_ITEMS) {
    if (existingItems.has(normalize(item.name))) continue;
    await db.collection("menuItems").doc().set({
      restaurantId, categoryId: categoryIds.get(normalize(item.category)), name: item.name, slug: slugify(item.name), description: item.description,
      price: item.price, imageUrl: `${SAMPLE_IMAGE_PREFIX}${item.image}`, preparationTimeMinutes: item.preparationTimeMinutes,
      isActive: true, isAvailable: true, isFeatured: item.isFeatured === true, sortOrder: nextItemOrder++, station: null,
      optionGroups: item.optionGroups ?? [], availableDays: item.availableDays ?? [], sample: true, createdAt: now, updatedAt: now
    });
    createdItems += 1;
  }

  invalidateRestaurantPublicData(restaurantId);
  return NextResponse.json({ ok: true, createdCategories, createdItems, requestId: staff.requestId }, { status: createdItems || createdCategories ? 201 : 200 });
}

export const POST = withApiErrors("admin/menu/sample", handler, "Não foi possível adicionar o cardápio de exemplo.");

export const dynamic = "force-dynamic";
