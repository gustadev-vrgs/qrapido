import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { FLOOR_ROLES, logAdminFailure, requireStaffRequest } from "@/lib/server/admin-auth";
import { classifyServerError } from "@/lib/server/api-errors";

const payloadSchema = z.object({
  tableId: z.string().min(1).max(128),
  reason: z.string().trim().max(300).optional(),
  /** Confirms closing while orders are still in the kitchen: they are marked as delivered. */
  force: z.boolean().optional(),
  /** How the bill was paid at the cashier. Marks every order of the attendance as paid. */
  paidWith: z.enum(["pix", "cash", "debit_card", "credit_card"]).optional()
}).strict();

const PAID_LABELS: Record<string, string> = { pix: "PIX", cash: "dinheiro", debit_card: "cartão de débito", credit_card: "cartão de crédito" };

const KITCHEN_PENDING = new Set(["received", "confirmed", "in_preparation"]);
type Db = any;

/**
 * Closes the attendance (the bill was settled). Ready orders become "entregue"
 * automatically, so nobody has to remember that tap. Orders still in the kitchen
 * need an explicit confirmation (force), which also marks them as delivered.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, FLOOR_ROLES);
  if (staff instanceof NextResponse) return staff;
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Mesa inválida." }, { status: 400 });
  const paidWith = parsed.data.paidWith ?? null;
  const reason = parsed.data.reason?.trim() || (paidWith ? `Conta paga (${PAID_LABELS[paidWith]})` : "Atendimento encerrado pela equipe");

  const db = getAdminFirestore() as Db;
  const tableRef = db.collection("tables").doc(parsed.data.tableId);
  try {
    const result = await db.runTransaction(async (tx: Db) => {
      const tableSnap = await tx.get(tableRef);
      if (!tableSnap.exists || tableSnap.data().restaurantId !== staff.staffUser.restaurantId) throw Object.assign(new Error("Mesa não encontrada."), { status: 404 });
      const table = tableSnap.data();
      const sessionId: string | null = table.currentSessionGroupId ?? null;

      // Equality-only queries (no composite index); filtering happens here.
      const [sessionSnap, ordersSnap, grantsSnap, callsSnap] = sessionId
        ? await Promise.all([
          tx.get(db.collection("tableSessions").doc(sessionId)),
          tx.get(db.collection("orders").where("sessionId", "==", sessionId)),
          tx.get(db.collection("sessionAccessGrants").where("sessionId", "==", sessionId)),
          tx.get(db.collection("waiterCalls").where("sessionId", "==", sessionId))
        ])
        : [null, null, null, null];

      const ownOrders = (ordersSnap?.docs ?? []).filter((doc: Db) => doc.data().restaurantId === staff.staffUser.restaurantId);
      const inKitchen = ownOrders.filter((doc: Db) => KITCHEN_PENDING.has(doc.data().status));
      if (inKitchen.length && !parsed.data.force) {
        const codes = inKitchen.map((doc: Db) => doc.data().orderCode ?? `#${doc.id.slice(-6).toUpperCase()}`);
        throw Object.assign(new Error(`Ainda na cozinha: ${codes.join(", ")}. Encerrar mesmo assim marca esses pedidos como entregues; se não foram servidos, cancele-os em Pedidos.`), { status: 409, code: "kitchen_pending", pending: codes });
      }

      const now = new Date().toISOString();
      const toDeliver = ownOrders.filter((doc: Db) => doc.data().status === "ready" || KITCHEN_PENDING.has(doc.data().status));
      const payment = (doc: Db) => (paidWith && doc.data().status !== "cancelled" ? { paidWith, paidAt: now, paymentStatus: `pago no caixa (${PAID_LABELS[paidWith]})`, financialReceiptConfirmed: true } : {});
      toDeliver.forEach((doc: Db) => tx.update(doc.ref, { status: "delivered", deliveredAt: now, readyAt: doc.data().readyAt ?? now, autoDelivered: true, ...payment(doc), updatedAt: now }));
      if (paidWith) {
        const deliveredIds = new Set(toDeliver.map((doc: Db) => doc.id));
        ownOrders.filter((doc: Db) => !deliveredIds.has(doc.id) && doc.data().status !== "cancelled").forEach((doc: Db) => tx.update(doc.ref, { ...payment(doc), updatedAt: now }));
      }
      const billTotal = Math.round(ownOrders.filter((doc: Db) => doc.data().status !== "cancelled").reduce((sum: number, doc: Db) => sum + Number(doc.data().total ?? 0), 0) * 100) / 100;

      const sessionBelongs = sessionSnap?.exists && sessionSnap.data().restaurantId === staff.staffUser.restaurantId;
      if (sessionBelongs && sessionSnap.data().status !== "closed") {
        tx.update(sessionSnap.ref, { status: "closed", closedAt: now, closeReason: reason, staffAccessCode: null, billTotal, paidWith, updatedAt: now });
      }
      const openGrants = (grantsSnap?.docs ?? []).filter((doc: Db) => !doc.data().revokedAt);
      openGrants.forEach((grant: Db) => tx.update(grant.ref, { revokedAt: now, revocationReason: "attendance_closed", updatedAt: now }));
      const openCalls = (callsSnap?.docs ?? []).filter((doc: Db) => doc.data().restaurantId === staff.staffUser.restaurantId && doc.data().status !== "completed");
      openCalls.forEach((call: Db) => {
        tx.update(call.ref, { status: "completed", completedAt: now, completedBy: staff.staffUser.id, updatedAt: now });
        if (call.data().lockId) tx.delete(db.collection("waiterCallLocks").doc(call.data().lockId));
      });

      const alreadyFree = table.status === "free" && !sessionId;
      tx.update(tableRef, { status: "free", closedAt: now, currentPeopleCount: 0, activeSessionCount: 0, currentSessionGroupId: null, updatedAt: now });
      tx.set(db.collection("orderEvents").doc(), {
        restaurantId: staff.staffUser.restaurantId, tableId: tableSnap.id, sessionId: sessionId ?? "none", orderId: "system", type: "table_closed",
        actorType: "staff", actorId: staff.staffUser.id,
        message: sessionBelongs ? "Atendimento encerrado e acessos revogados" : "Mesa liberada (não havia atendimento válido vinculado)",
        metadata: { reason, paidWith, billTotal, revokedGrantCount: openGrants.length, autoDelivered: toDeliver.length, forcedKitchen: inKitchen.length, recovered: !sessionBelongs }, createdAt: now
      });
      return { replay: alreadyFree, recovered: !sessionBelongs, autoDelivered: toDeliver.length, billTotal, paidWith };
    });
    return NextResponse.json({ ok: true, ...result, requestId: staff.requestId });
  } catch (error) {
    const failure = error as { status?: number; code?: string; pending?: string[] };
    const status = Number(failure.status ?? 500);
    if (status !== 500) return NextResponse.json({ error: (error as Error).message, code: failure.code, pending: failure.pending, requestId: staff.requestId }, { status });
    logAdminFailure(staff.requestId, "close_table", error);
    const classified = classifyServerError(error);
    return NextResponse.json({ error: "Não foi possível encerrar a mesa; nada foi alterado.", code: classified.code, hint: classified.hint, requestId: staff.requestId }, { status: classified.status });
  }
}
