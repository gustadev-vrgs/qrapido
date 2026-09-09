import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createOperationalEvent, resolveTable } from "@/lib/server/public-session";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { requireStaffRequest, ADMIN_ROLES, forbiddenResource } from "@/lib/server/admin-auth";

const payloadSchema = z.object({
  tableId: z.string().min(1)
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, ADMIN_ROLES);
  if (staff instanceof NextResponse) return staff;

  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const table = await resolveTable(parsed.data.tableId);
  if (!table) {
    return NextResponse.json({ error: "Mesa não encontrada." }, { status: 404 });
  }
  if (table.restaurantId !== staff.staffUser.restaurantId) return forbiddenResource(staff.requestId);

  const db = getAdminFirestore() as any;
  const closedAt = new Date().toISOString();
  const sessionSnapshot = await db
    .collection("tableSessions")
    .where("restaurantId", "==", staff.staffUser.restaurantId)
    .where("tableId", "==", table.id)
    .where("status", "in", ["active", "idle"])
    .get();

  for (const doc of sessionSnapshot.docs) {
    await db.collection("tableSessions").doc(doc.id).set({ status: "closed", closedAt, updatedAt: closedAt }, { merge: true });
    await createOperationalEvent({
      restaurantId: table.restaurantId,
      tableId: table.id,
      sessionId: doc.id,
      type: "session_closed",
      message: "Sessão encerrada por fechamento da mesa",
      metadata: { reason: "table_closed" }
    });
  }
  const grants = await db.collection("sessionAccessGrants").where("tableId", "==", table.id).where("revokedAt", "==", null).get();
  for (const grant of grants.docs) await grant.ref.set({ revokedAt: closedAt, updatedAt: closedAt }, { merge: true });

  await db.collection("tables").doc(table.id).set(
    {
      status: "free",
      closedAt,
      currentPeopleCount: 0,
      activeSessionCount: 0,
      currentSessionGroupId: null,
      updatedAt: closedAt
    },
    { merge: true }
  );

  await createOperationalEvent({
    restaurantId: table.restaurantId,
    tableId: table.id,
    sessionId: table.currentSessionGroupId ?? "system",
    type: "table_closed",
    message: "Mesa encerrada no painel"
  });

  return NextResponse.json({ ok: true, requestId: staff.requestId }, { headers: { "x-request-id": staff.requestId } });
}
