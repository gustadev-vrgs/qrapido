import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { ADMIN_ROLES, logAdminFailure, requireStaffRequest } from "@/lib/server/admin-auth";

const schema = z.object({
  tableId: z.string().min(1),
  action: z.enum(["renew", "expire"]),
  durationMinutes: z.number().int().min(5).max(360).optional(),
  maxOrdersAllowed: z.number().int().min(1).max(100).optional(),
  orderLimitEnabled: z.boolean().optional(),
  reason: z.string().trim().min(4).max(300)
}).strict();

export async function POST(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, ADMIN_ROLES);
  if (staff instanceof NextResponse) return staff;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ação, motivo ou limites inválidos." }, { status: 400 });
  const db = getAdminFirestore() as any;
  const tableRef = db.collection("tables").doc(parsed.data.tableId);
  try {
    const result = await db.runTransaction(async (tx: any) => {
      const tableSnap = await tx.get(tableRef);
      if (!tableSnap.exists || tableSnap.data().restaurantId !== staff.staffUser.restaurantId) throw Object.assign(new Error("Mesa não encontrada."), { status: 404 });
      const table = tableSnap.data();
      if (!table.currentSessionGroupId) throw Object.assign(new Error("Mesa sem atendimento atual."), { status: 409 });
      const sessionRef = db.collection("tableSessions").doc(table.currentSessionGroupId);
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists || sessionSnap.data().restaurantId !== staff.staffUser.restaurantId || sessionSnap.data().status === "closed") throw Object.assign(new Error("Atendimento já encerrado."), { status: 409 });
      const now = new Date(); const nowIso = now.toISOString();
      const renewing = parsed.data.action === "renew";
      const renewedExpiresAt = new Date(now.getTime() + (parsed.data.durationMinutes ?? 90) * 60_000).toISOString();
      const sessionPatch = renewing ? {
        status: "active", expiresAt: renewedExpiresAt,
        ...(parsed.data.maxOrdersAllowed === undefined ? {} : { maxOrdersAllowed: parsed.data.maxOrdersAllowed }),
        ...(parsed.data.orderLimitEnabled === undefined ? {} : { orderLimitEnabled: parsed.data.orderLimitEnabled }), updatedAt: nowIso
      } : { status: "expired", expiredAt: nowIso, updatedAt: nowIso };
      tx.update(sessionRef, sessionPatch);
      tx.update(tableRef, { status: renewing ? "active" : "blocked", updatedAt: nowIso });
      tx.set(db.collection("orderEvents").doc(), { restaurantId: staff.staffUser.restaurantId, tableId: tableSnap.id, sessionId: sessionSnap.id, orderId: "system", type: renewing ? "session_renewed" : "session_expired", actorType: "staff", actorId: staff.staffUser.id, message: renewing ? "Atendimento renovado" : "Novos pedidos bloqueados por expiração", metadata: { reason: parsed.data.reason, durationMinutes: parsed.data.durationMinutes ?? null, maxOrdersAllowed: parsed.data.maxOrdersAllowed ?? null }, createdAt: nowIso });
      return { expiresAt: renewing ? renewedExpiresAt : sessionSnap.data().expiresAt };
    });
    return NextResponse.json({ ok: true, ...result, requestId: staff.requestId });
  } catch (error) {
    const status = Number((error as { status?: number }).status ?? 500);
    if (status === 500) logAdminFailure(staff.requestId, "session_action", error);
    return NextResponse.json({ error: status === 500 ? "Não foi possível alterar o atendimento." : (error as Error).message }, { status });
  }
}
