import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { FLOOR_ROLES, logAdminFailure, requireStaffRequest } from "@/lib/server/admin-auth";
import { classifyServerError } from "@/lib/server/api-errors";

const payloadSchema = z.object({ tableId: z.string().min(1).max(128), reason: z.string().trim().max(300).optional() }).strict();
const PENDING_ORDER_STATUSES = new Set(["received", "confirmed", "in_preparation", "ready"]);
type Db = any;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, FLOOR_ROLES);
  if (staff instanceof NextResponse) return staff;
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Mesa inválida." }, { status: 400 });
  const reason = parsed.data.reason?.trim() || "Atendimento encerrado pela equipe";

  const db = getAdminFirestore() as Db;
  const tableRef = db.collection("tables").doc(parsed.data.tableId);
  try {
    const result = await db.runTransaction(async (tx: Db) => {
      const tableSnap = await tx.get(tableRef);
      if (!tableSnap.exists || tableSnap.data().restaurantId !== staff.staffUser.restaurantId) throw Object.assign(new Error("Mesa não encontrada."), { status: 404 });
      const table = tableSnap.data();
      const sessionId: string | null = table.currentSessionGroupId ?? null;

      // Equality-only queries (no composite index); filtering happens here.
      const [sessionSnap, ordersSnap, grantsSnap] = sessionId
        ? await Promise.all([
          tx.get(db.collection("tableSessions").doc(sessionId)),
          tx.get(db.collection("orders").where("sessionId", "==", sessionId)),
          tx.get(db.collection("sessionAccessGrants").where("sessionId", "==", sessionId))
        ])
        : [null, null, null];

      const pending = (ordersSnap?.docs ?? []).filter((doc: Db) => doc.data().restaurantId === staff.staffUser.restaurantId && PENDING_ORDER_STATUSES.has(doc.data().status));
      if (pending.length) {
        const codes = pending.map((doc: Db) => doc.data().orderCode ?? `#${doc.id.slice(-6).toUpperCase()}`).join(", ");
        throw Object.assign(new Error(`Há ${pending.length} pedido(s) em andamento (${codes}). Marque como entregue ou cancele em Pedidos antes de encerrar.`), { status: 409 });
      }

      const now = new Date().toISOString();
      const sessionBelongs = sessionSnap?.exists && sessionSnap.data().restaurantId === staff.staffUser.restaurantId;
      if (sessionBelongs && sessionSnap.data().status !== "closed") {
        tx.update(sessionSnap.ref, { status: "closed", closedAt: now, closeReason: reason, staffAccessCode: null, updatedAt: now });
      }
      const openGrants = (grantsSnap?.docs ?? []).filter((doc: Db) => !doc.data().revokedAt);
      openGrants.forEach((grant: Db) => tx.update(grant.ref, { revokedAt: now, revocationReason: "attendance_closed", updatedAt: now }));
      const alreadyFree = table.status === "free" && !sessionId;
      tx.update(tableRef, { status: "free", closedAt: now, currentPeopleCount: 0, activeSessionCount: 0, currentSessionGroupId: null, updatedAt: now });
      tx.set(db.collection("orderEvents").doc(), {
        restaurantId: staff.staffUser.restaurantId, tableId: tableSnap.id, sessionId: sessionId ?? "none", orderId: "system", type: "table_closed",
        actorType: "staff", actorId: staff.staffUser.id,
        message: sessionBelongs ? "Atendimento encerrado e acessos revogados" : "Mesa liberada (não havia atendimento válido vinculado)",
        metadata: { reason, revokedGrantCount: openGrants.length, recovered: !sessionBelongs }, createdAt: now
      });
      return { replay: alreadyFree, recovered: !sessionBelongs };
    });
    return NextResponse.json({ ok: true, ...result, requestId: staff.requestId });
  } catch (error) {
    const status = Number((error as { status?: number }).status ?? 500);
    if (status !== 500) return NextResponse.json({ error: (error as Error).message, requestId: staff.requestId }, { status });
    logAdminFailure(staff.requestId, "close_table", error);
    const failure = classifyServerError(error);
    return NextResponse.json({ error: "Não foi possível encerrar a mesa; nada foi alterado.", code: failure.code, hint: failure.hint, requestId: staff.requestId }, { status: failure.status });
  }
}
