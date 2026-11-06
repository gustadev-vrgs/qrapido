import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { ADMIN_ROLES, requireStaffRequest } from "@/lib/server/admin-auth";
import { withApiErrors } from "@/lib/server/api-errors";
import { writeAudit } from "@/lib/server/audit";
import { invalidateRestaurantPublicData } from "@/lib/server/public-cache";

type Db = any;

const id = z.string().trim().min(1).max(128);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete_item"), itemId: id }).strict(),
  z.object({ action: z.literal("duplicate_item"), itemId: id }).strict(),
  // A category with dishes needs a decision: move them to another category or delete them too.
  z.object({ action: z.literal("delete_category"), categoryId: id, items: z.enum(["none", "move", "delete"]), moveTo: id.optional() }).strict()
]);

class Refusal extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); }
}

async function own(db: Db, collection: string, docId: string, restaurantId: string, label: string) {
  const snap = await db.collection(collection).doc(docId).get();
  if (!snap.exists || snap.data().restaurantId !== restaurantId) throw new Refusal(`${label} não encontrado(a). Atualize a tela.`, 404, "not_found");
  return snap;
}

/**
 * Menu changes the browser cannot do by itself (the Firestore rules never let it delete):
 * delete a dish (and its photo), duplicate a dish (photo included) and delete a category.
 * Past orders keep their own copy of names and prices, so history and reports stay intact.
 */
async function handler(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, ADMIN_ROLES);
  if (staff instanceof NextResponse) return staff;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido.", code: "invalid_body" }, { status: 400 });
  const body = parsed.data;
  const restaurantId = staff.staffUser.restaurantId;
  const db = getAdminFirestore() as Db;
  const now = new Date().toISOString();
  const audit = (type: string, message: string, metadata: Record<string, unknown>) => writeAudit(db, { restaurantId, actorId: staff.staffUser.id, actorName: staff.staffUser.name ?? null, type, message, metadata });

  try {
    if (body.action === "delete_item") {
      const item = await own(db, "menuItems", body.itemId, restaurantId, "Item");
      await db.collection("menuImages").doc(body.itemId).delete();
      await item.ref.delete();
      await audit("menu_item_deleted", `Item "${item.data().name}" excluído do cardápio`, { itemId: body.itemId, name: item.data().name, price: item.data().price });
      invalidateRestaurantPublicData(restaurantId);
      return NextResponse.json({ ok: true, requestId: staff.requestId });
    }

    if (body.action === "duplicate_item") {
      const item = await own(db, "menuItems", body.itemId, restaurantId, "Item");
      const data = item.data();
      const copyRef = db.collection("menuItems").doc();
      const photo = await db.collection("menuImages").doc(body.itemId).get();
      let imageUrl = data.imageUrl ?? null;
      if (photo.exists && photo.data().restaurantId === restaurantId) {
        await db.collection("menuImages").doc(copyRef.id).set({ ...photo.data(), updatedAt: now, updatedBy: staff.staffUser.id });
        imageUrl = `/api/public/menu-image/${copyRef.id}?v=${Date.now().toString(36)}`;
      } else if (typeof imageUrl === "string" && imageUrl.startsWith("/api/public/menu-image/")) {
        imageUrl = null; // the original points to a photo that no longer exists
      }
      const name = `${String(data.name ?? "Item").slice(0, 110)} (cópia)`;
      // Starts hidden so customers never see two equal dishes while it is being edited.
      await copyRef.set({ ...data, name, slug: `${String(data.slug ?? "item").slice(0, 70)}-copia-${copyRef.id.slice(0, 4).toLowerCase()}`, imageUrl, isActive: false, isFeatured: false, sample: false, createdAt: now, updatedAt: now });
      return NextResponse.json({ ok: true, itemId: copyRef.id, requestId: staff.requestId }, { status: 201 });
    }

    const category = await own(db, "menuCategories", body.categoryId, restaurantId, "Categoria");
    const itemsSnap = await db.collection("menuItems").where("restaurantId", "==", restaurantId).where("categoryId", "==", body.categoryId).get();
    const items = itemsSnap.docs;
    if (items.length && body.items === "none") throw new Refusal(`A categoria tem ${items.length} item(ns). Escolha mover ou excluir junto.`, 409, "category_not_empty");
    if (items.length && body.items === "move") {
      if (!body.moveTo || body.moveTo === body.categoryId) throw new Refusal("Escolha para qual categoria mover os itens.", 400, "move_target");
      await own(db, "menuCategories", body.moveTo, restaurantId, "Categoria de destino");
      await Promise.all(items.map((doc: Db) => doc.ref.update({ categoryId: body.moveTo, updatedAt: now })));
    }
    if (items.length && body.items === "delete") {
      await Promise.all(items.map(async (doc: Db) => { await db.collection("menuImages").doc(doc.id).delete(); await doc.ref.delete(); }));
    }
    await category.ref.delete();
    await audit("menu_category_deleted", `Categoria "${category.data().name}" excluída${items.length ? (body.items === "move" ? `; ${items.length} item(ns) movido(s)` : `; ${items.length} item(ns) excluído(s)`) : ""}`, { categoryId: body.categoryId, name: category.data().name, items: items.length, mode: body.items });
    invalidateRestaurantPublicData(restaurantId);
    return NextResponse.json({ ok: true, items: items.length, requestId: staff.requestId });
  } catch (error) {
    if (error instanceof Refusal) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    throw error;
  }
}

export const POST = withApiErrors("admin/menu/manage", handler, "Não foi possível alterar o cardápio.");

export const dynamic = "force-dynamic";
