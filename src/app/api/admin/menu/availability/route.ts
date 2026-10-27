import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { requireStaffRequest, STAFF_ROLES } from "@/lib/server/admin-auth";
import { withApiErrors } from "@/lib/server/api-errors";

const schema = z.object({ itemId: z.string().trim().min(1).max(128), isAvailable: z.boolean() }).strict();

/** "Acabou" / "Voltou": any staff member (the kitchen included) can mark an item as sold out with one tap. */
async function handler(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, STAFF_ROLES);
  if (staff instanceof NextResponse) return staff;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Item inválido." }, { status: 400 });
  const db = getAdminFirestore() as any;
  const ref = db.collection("menuItems").doc(parsed.data.itemId);
  const snap = await ref.get();
  if (!snap.exists || snap.data().restaurantId !== staff.staffUser.restaurantId) return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });
  const now = new Date().toISOString();
  await ref.update({ isAvailable: parsed.data.isAvailable, updatedAt: now, availabilityChangedBy: staff.staffUser.id, availabilityChangedAt: now });
  return NextResponse.json({ ok: true, isAvailable: parsed.data.isAvailable, requestId: staff.requestId });
}

export const POST = withApiErrors("admin/menu/availability", handler, "Não foi possível mudar a disponibilidade.");
