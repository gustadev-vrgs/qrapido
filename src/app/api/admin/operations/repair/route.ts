import { NextRequest, NextResponse } from "next/server";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { ADMIN_ROLES, requireStaffRequest } from "@/lib/server/admin-auth";
import { withApiErrors } from "@/lib/server/api-errors";
import { createPublicTableToken } from "@/lib/server/public-session";
import { DEFAULT_BUSINESS_HOURS } from "@/lib/constants/restaurant-settings";
import { buildPublicTableUrl, isValidPublicTableToken } from "@/lib/utils/public-url";

type Db = any;

/**
 * Safe, additive fixes for a new or legacy project. It only creates what is
 * missing (restaurant record, default settings) and gives tables without a
 * valid QR identifier a new one. It never deletes data or touches orders.
 */
async function repair(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, ADMIN_ROLES);
  if (staff instanceof NextResponse) return staff;
  const restaurantId = staff.staffUser.restaurantId;
  const db = getAdminFirestore() as Db;
  const now = new Date().toISOString();
  const done: string[] = [];

  const restaurantRef = db.collection("restaurants").doc(restaurantId);
  const restaurant = await restaurantRef.get();
  if (!restaurant.exists) {
    // Older setups stored the restaurant under a random id: reuse its name if found.
    const legacy = await db.collection("restaurants").where("restaurantId", "==", restaurantId).limit(1).get();
    const legacyData = legacy.empty ? {} : legacy.docs[0].data();
    await restaurantRef.set({ restaurantId, name: legacyData.name ?? "Meu Restaurante", slug: legacyData.slug ?? restaurantId.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 80), description: legacyData.description ?? "", address: legacyData.address ?? "", phone: legacyData.phone ?? "", logoUrl: legacyData.logoUrl ?? null, isActive: true, createdAt: now, updatedAt: now });
    done.push("Cadastro do restaurante criado.");
  }

  const settings = await db.collection("restaurantSettings").where("restaurantId", "==", restaurantId).limit(1).get();
  if (settings.empty) {
    await db.collection("restaurantSettings").add({ restaurantId, acceptedPaymentMethods: ["pix", "cash", "debit_card", "credit_card"], pixKey: null, pixReceiverName: null, pixReceiverCity: null, pixInstructions: null, businessHours: DEFAULT_BUSINESS_HOURS, antiSpamWindowSeconds: 60, maxOrdersPerWindow: 5, defaultSessionDurationMinutes: 240, allowSessionPin: false, requireCustomerName: false, allowCustomerNotes: true, serviceFeePercent: 10, waiterCallEnabled: true, billRequestEnabled: true, createdAt: now, updatedAt: now });
    done.push("Configurações padrão criadas.");
  }

  const tables = await db.collection("tables").where("restaurantId", "==", restaurantId).get();
  let fixedTokens = 0;
  for (const doc of tables.docs) {
    if (isValidPublicTableToken(doc.data().publicToken)) continue;
    const publicToken = createPublicTableToken();
    await doc.ref.set({ publicToken, qrCodeValue: buildPublicTableUrl(publicToken, request.nextUrl.origin), updatedAt: now }, { merge: true });
    fixedTokens += 1;
  }
  if (fixedTokens) done.push(`${fixedTokens} mesa(s) receberam um QR Code novo. Imprima novamente.`);

  return NextResponse.json({ ok: true, done: done.length ? done : ["Nada precisava ser corrigido."] }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = withApiErrors("admin/operations/repair", repair, "Não foi possível aplicar as correções.");

export const dynamic = "force-dynamic";
