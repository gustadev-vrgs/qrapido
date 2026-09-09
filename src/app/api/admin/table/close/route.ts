import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { requireStaffRequest, ADMIN_ROLES, logAdminFailure } from "@/lib/server/admin-auth";

const payloadSchema = z.object({ tableId: z.string().min(1), reason: z.string().trim().min(4).max(300) }).strict();
const PENDING_ORDER_STATUSES = ["received", "confirmed", "in_preparation", "ready"];

export async function POST(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, ADMIN_ROLES);
  if (staff instanceof NextResponse) return staff;
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Informe a mesa e o motivo do encerramento." }, { status: 400 });

  const db = getAdminFirestore() as any;
  const tableRef = db.collection("tables").doc(parsed.data.tableId);
  try {
    const result = await db.runTransaction(async (tx: any) => {
      const tableSnap = await tx.get(tableRef);
      if (!tableSnap.exists) throw Object.assign(new Error("Mesa não encontrada."), { status: 404 });
      const table = tableSnap.data();
      if (table.restaurantId !== staff.staffUser.restaurantId) throw Object.assign(new Error("Mesa não encontrada."), { status: 404 });
      if (!table.currentSessionGroupId) {
        if (table.status === "free") return { replay: true };
        throw Object.assign(new Error("Mesa sem referência de atendimento. Execute o diagnóstico antes de recuperar."), { status: 409 });
      }
      const sessionRef = db.collection("tableSessions").doc(table.currentSessionGroupId);
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists || sessionSnap.data().restaurantId !== staff.staffUser.restaurantId) throw Object.assign(new Error("Atendimento inconsistente. Nenhum dado foi apagado; execute o diagnóstico."), { status: 409 });
      const ordersQuery = db.collection("orders").where("restaurantId", "==", staff.staffUser.restaurantId).where("sessionId", "==", sessionSnap.id).where("status", "in", PENDING_ORDER_STATUSES);
      const grantsQuery = db.collection("sessionAccessGrants").where("sessionId", "==", sessionSnap.id).where("revokedAt", "==", null);
      const [pendingOrders, grants] = await Promise.all([tx.get(ordersQuery), tx.get(grantsQuery)]);
      if (!pendingOrders.empty) throw Object.assign(new Error(`Há ${pendingOrders.size} pedido(s) pendente(s). Conclua ou cancele antes de encerrar.`), { status: 409 });

      const now = new Date().toISOString();
      tx.update(sessionRef, { status: "closed", closedAt: now, closeReason: parsed.data.reason, updatedAt: now });
      grants.docs.forEach((grant: any) => tx.update(grant.ref, { revokedAt: now, revocationReason: "attendance_closed", updatedAt: now }));
      tx.update(tableRef, { status: "free", closedAt: now, currentPeopleCount: 0, activeSessionCount: 0, currentSessionGroupId: null, updatedAt: now });
      tx.set(db.collection("orderEvents").doc(), { restaurantId: staff.staffUser.restaurantId, tableId: tableSnap.id, sessionId: sessionSnap.id, orderId: "system", type: "table_closed", actorType: "staff", actorId: staff.staffUser.id, message: "Atendimento encerrado e acessos revogados", metadata: { reason: parsed.data.reason, revokedGrantCount: grants.size }, createdAt: now });
      return { replay: false };
    });
    return NextResponse.json({ ok: true, ...result, requestId: staff.requestId });
  } catch (error) {
    const status = Number((error as { status?: number }).status ?? 500);
    if (status === 500) logAdminFailure(staff.requestId, "close_table", error);
    return NextResponse.json({ error: status === 500 ? "Não foi possível encerrar; nenhuma alteração parcial foi confirmada." : (error as Error).message, requestId: staff.requestId }, { status });
  }
}
