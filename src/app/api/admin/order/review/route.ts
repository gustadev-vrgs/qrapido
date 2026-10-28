import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { requireStaffRequest, STAFF_ROLES } from "@/lib/server/admin-auth";
import { withApiErrors } from "@/lib/server/api-errors";

const schema = z.object({ orderId: z.string().trim().min(1).max(128) }).strict();
type Db = any;

/** "Mesa confirmou": the team checked an out-of-the-ordinary cart with the table. Clears the warning on every order of that cart. */
async function handler(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, STAFF_ROLES);
  if (staff instanceof NextResponse) return staff;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const db = getAdminFirestore() as Db;
  const snap = await db.collection("orders").doc(parsed.data.orderId).get();
  if (!snap.exists || snap.data().restaurantId !== staff.staffUser.restaurantId) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
  const order = snap.data();
  // Same cart = same groupCode in the same attendance (kitchen + drinks orders).
  const siblings = order.groupCode
    ? (await db.collection("orders").where("sessionId", "==", order.sessionId).get()).docs.filter((doc: Db) => doc.data().groupCode === order.groupCode && doc.data().restaurantId === staff.staffUser.restaurantId)
    : [snap];
  const now = new Date().toISOString();
  await Promise.all(siblings.map((doc: Db) => doc.ref.update({ riskReviewedAt: now, riskReviewedBy: staff.staffUser.id, updatedAt: now })));
  await db.collection("orderEvents").doc().set({ restaurantId: staff.staffUser.restaurantId, orderId: snap.id, tableId: order.tableId, sessionId: order.sessionId, type: "order_updated", actorType: "staff", actorId: staff.staffUser.id, message: "Pedido fora do comum confirmado com a mesa", metadata: { riskFlags: order.riskFlags ?? [], groupCode: order.groupCode ?? null }, createdAt: now });
  return NextResponse.json({ ok: true, reviewed: siblings.length, requestId: staff.requestId });
}

export const POST = withApiErrors("admin/order/review", handler, "Não foi possível confirmar o pedido.");
