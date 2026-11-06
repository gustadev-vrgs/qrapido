import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { mapRestaurant, mapSettings } from "@/lib/data/mappers/domain-mappers";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { ADMIN_ROLES, requireStaffRequest } from "@/lib/server/admin-auth";
import { withApiErrors } from "@/lib/server/api-errors";
import { invalidateRestaurantPublicData } from "@/lib/server/public-cache";
import { updateRestaurantSettingsPayloadSchema } from "@/lib/schemas";

type Db = any;

const restaurantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(20),
  address: z.string().trim().max(180),
  legalName: z.string().trim().max(120).nullable(),
  // CNPJ (14 digits) or CPF (11), with or without punctuation; empty = not printed.
  document: z.string().trim().max(20).regex(/^[\d./-]*$/).nullable()
}).strict();

const saveSchema = z.object({
  restaurant: restaurantSchema,
  settings: updateRestaurantSettingsPayloadSchema.required({ acceptedPaymentMethods: true, businessHours: true })
}).strict();

async function findSettings(db: Db, restaurantId: string) {
  const snap = await db.collection("restaurantSettings").where("restaurantId", "==", restaurantId).limit(1).get();
  return snap.empty ? null : snap.docs[0];
}

/**
 * Configurações reads and saves through the server: one request instead of two
 * browser Firestore queries, the same answer whatever rules are published, and
 * the values are validated here before they reach the database.
 */
async function read(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, ADMIN_ROLES);
  if (staff instanceof NextResponse) return staff;
  const restaurantId = staff.staffUser.restaurantId;
  const db = getAdminFirestore() as Db;
  const [restaurantSnap, settingsDoc] = await Promise.all([db.collection("restaurants").doc(restaurantId).get(), findSettings(db, restaurantId)]);
  const restaurant = restaurantSnap.exists ? mapRestaurant(restaurantSnap.id, restaurantSnap.data()) : null;
  return NextResponse.json({
    restaurant: restaurant ? { name: restaurant.name, phone: restaurant.phone, address: restaurant.address, legalName: restaurant.legalName ?? null, document: restaurant.document ?? null } : null,
    settings: settingsDoc ? mapSettings(settingsDoc.id, settingsDoc.data()) : null,
    requestId: staff.requestId
  }, { headers: { "Cache-Control": "no-store" } });
}

async function save(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, ADMIN_ROLES);
  if (staff instanceof NextResponse) return staff;
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path.join(".") ?? "";
    return NextResponse.json({ error: `Confira o campo ${field || "informado"}.`, code: "invalid_body" }, { status: 400 });
  }
  const { restaurant, settings } = parsed.data;
  const digits = (restaurant.document ?? "").replace(/\D/g, "");
  if (digits && digits.length !== 11 && digits.length !== 14) {
    return NextResponse.json({ error: "CPF tem 11 números e CNPJ tem 14.", code: "invalid_document" }, { status: 400 });
  }
  const restaurantId = staff.staffUser.restaurantId;
  const db = getAdminFirestore() as Db;
  const now = new Date().toISOString();
  const restaurantRef = db.collection("restaurants").doc(restaurantId);
  const [restaurantSnap, settingsDoc] = await Promise.all([restaurantRef.get(), findSettings(db, restaurantId)]);
  if (!settingsDoc) return NextResponse.json({ error: "Crie o cadastro inicial antes de salvar.", code: "settings_missing" }, { status: 409 });

  await restaurantRef.set({
    restaurantId, ...restaurant, legalName: restaurant.legalName || null, document: restaurant.document || null, updatedAt: now,
    ...(restaurantSnap.exists ? {} : { slug: restaurantId.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 80), description: "", logoUrl: null, isActive: true, createdAt: now })
  }, { merge: true });
  await settingsDoc.ref.set({ ...settings, restaurantId, updatedAt: now }, { merge: true });
  invalidateRestaurantPublicData(restaurantId);
  return NextResponse.json({ ok: true, requestId: staff.requestId });
}

export const GET = withApiErrors("admin/settings", read, "Não foi possível carregar as configurações.");
export const POST = withApiErrors("admin/settings", save, "Não foi possível salvar as configurações.");

export const dynamic = "force-dynamic";
