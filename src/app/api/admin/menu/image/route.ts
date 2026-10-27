import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { ADMIN_ROLES, requireStaffRequest } from "@/lib/server/admin-auth";
import { withApiErrors } from "@/lib/server/api-errors";

/** Photos are resized on the phone/computer before upload; this is a safety cap. */
const MAX_IMAGE_BYTES = 350 * 1024;
const DATA_URL = /^data:(image\/(?:jpeg|webp|png));base64,([A-Za-z0-9+/=]+)$/;
const schema = z.object({ itemId: z.string().trim().min(1).max(128), dataUrl: z.string().max(600_000).nullable() }).strict();

/**
 * Stores a dish photo in Firestore (collection menuImages, server-only) and points
 * the item to /api/public/menu-image/<id>. No Firebase Storage/billing needed.
 * dataUrl null removes the photo.
 */
async function handler(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, ADMIN_ROLES);
  if (staff instanceof NextResponse) return staff;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Foto inválida." }, { status: 400 });
  const db = getAdminFirestore() as any;
  const itemRef = db.collection("menuItems").doc(parsed.data.itemId);
  const imageRef = db.collection("menuImages").doc(parsed.data.itemId);
  const snap = await itemRef.get();
  if (!snap.exists || snap.data().restaurantId !== staff.staffUser.restaurantId) return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });
  const now = new Date().toISOString();

  if (parsed.data.dataUrl === null) {
    await imageRef.delete();
    await itemRef.update({ imageUrl: null, updatedAt: now });
    return NextResponse.json({ ok: true, imageUrl: null });
  }

  const match = DATA_URL.exec(parsed.data.dataUrl);
  if (!match) return NextResponse.json({ error: "Envie uma foto JPG, PNG ou WebP." }, { status: 400 });
  const bytes = Buffer.from(match[2], "base64").length;
  if (bytes === 0 || bytes > MAX_IMAGE_BYTES) return NextResponse.json({ error: "A foto ficou grande demais. Tente outra foto." }, { status: 413 });
  await imageRef.set({ restaurantId: staff.staffUser.restaurantId, contentType: match[1], data: match[2], bytes, updatedAt: now, updatedBy: staff.staffUser.id });
  const imageUrl = `/api/public/menu-image/${encodeURIComponent(parsed.data.itemId)}?v=${Date.now().toString(36)}`;
  await itemRef.update({ imageUrl, updatedAt: now });
  return NextResponse.json({ ok: true, imageUrl, bytes });
}

export const POST = withApiErrors("admin/menu/image", handler, "Não foi possível salvar a foto.");
