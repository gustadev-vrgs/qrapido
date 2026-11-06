import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { FLOOR_ROLES, logAdminFailure, requireStaffRequest } from "@/lib/server/admin-auth";
import { classifyServerError } from "@/lib/server/api-errors";
import { newReceiptToken, receiptLines, receiptPath, type ReceiptDoc } from "@/lib/server/receipts";
import { toRestaurantDateKey } from "@/lib/utils/date-key";

const payloadSchema = z.object({
  tableId: z.string().min(1).max(128),
  reason: z.string().trim().max(300).optional(),
  /** Confirms closing while orders are still in the kitchen: they are marked as delivered. */
  force: z.boolean().optional(),
  /** How the bill was paid at the cashier. Marks every order of the attendance as paid. */
  paidWith: z.enum(["pix", "cash", "debit_card", "credit_card"]).optional(),
  /** Bill split across methods (e.g. part PIX, part card). Must add up to the bill total. */
  payments: z.array(z.object({
    method: z.enum(["pix", "cash", "debit_card", "credit_card"]),
    amount: z.number().finite().positive().max(1_000_000).transform((value) => Math.round(value * 100) / 100)
  }).strict()).min(1).max(6).optional()
}).strict().refine((value) => !(value.paidWith && value.payments), { message: "Envie paidWith ou payments, não os dois." });

const PAID_LABELS: Record<string, string> = { pix: "PIX", cash: "dinheiro", debit_card: "cartão de débito", credit_card: "cartão de crédito" };

const KITCHEN_PENDING = new Set(["received", "confirmed", "in_preparation"]);
const formatBRL = (value: number): string => `R$ ${value.toFixed(2).replace(".", ",")}`;
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
  if (!parsed.success) {
    const aboutPayments = parsed.error.issues.some((issue) => issue.path[0] === "payments" || issue.path.length === 0);
    return NextResponse.json({ error: aboutPayments ? "Confira os valores e as formas de pagamento." : "Mesa inválida." }, { status: 400 });
  }
  const requestedPayments = parsed.data.payments ?? null;
  // With a split, the method that received the most is kept as paidWith for older screens.
  const paidWith = parsed.data.paidWith ?? (requestedPayments ? [...requestedPayments].sort((a, b) => b.amount - a.amount)[0].method : null);
  const describePayments = (list: Array<{ method: string; amount: number }>) => list.map((item) => `${PAID_LABELS[item.method]} ${formatBRL(item.amount)}`).join(" + ");
  const reason = parsed.data.reason?.trim() || (requestedPayments && requestedPayments.length > 1 ? `Conta paga (${describePayments(requestedPayments)})` : paidWith ? `Conta paga (${PAID_LABELS[paidWith]})` : "Atendimento encerrado pela equipe");

  const db = getAdminFirestore() as Db;
  const tableRef = db.collection("tables").doc(parsed.data.tableId);
  try {
    const result = await db.runTransaction(async (tx: Db) => {
      const tableSnap = await tx.get(tableRef);
      if (!tableSnap.exists || tableSnap.data().restaurantId !== staff.staffUser.restaurantId) throw Object.assign(new Error("Mesa não encontrada."), { status: 404 });
      const table = tableSnap.data();
      const sessionId: string | null = table.currentSessionGroupId ?? null;

      // Equality-only queries (no composite index); filtering happens here.
      const restaurantRef = db.collection("restaurants").doc(staff.staffUser.restaurantId);
      const [sessionSnap, ordersSnap, grantsSnap, callsSnap, restaurantSnap] = sessionId
        ? await Promise.all([
          tx.get(db.collection("tableSessions").doc(sessionId)),
          tx.get(db.collection("orders").where("sessionId", "==", sessionId)),
          tx.get(db.collection("sessionAccessGrants").where("sessionId", "==", sessionId)),
          tx.get(db.collection("waiterCalls").where("sessionId", "==", sessionId)),
          tx.get(restaurantRef)
        ])
        : [null, null, null, null, null];

      const ownOrders = (ordersSnap?.docs ?? []).filter((doc: Db) => doc.data().restaurantId === staff.staffUser.restaurantId);
      const inKitchen = ownOrders.filter((doc: Db) => KITCHEN_PENDING.has(doc.data().status));
      if (inKitchen.length && !parsed.data.force) {
        const codes = inKitchen.map((doc: Db) => doc.data().orderCode ?? `#${doc.id.slice(-6).toUpperCase()}`);
        throw Object.assign(new Error(`Ainda na cozinha: ${codes.join(", ")}. Encerrar mesmo assim marca esses pedidos como entregues; se não foram servidos, cancele-os em Pedidos.`), { status: 409, code: "kitchen_pending", pending: codes });
      }

      const now = new Date().toISOString();
      const billTotal = Math.round(ownOrders.filter((doc: Db) => doc.data().status !== "cancelled").reduce((sum: number, doc: Db) => sum + Number(doc.data().total ?? 0), 0) * 100) / 100;
      // What was actually received, per method. A single method covers the whole bill.
      const payments = requestedPayments ?? (paidWith ? [{ method: paidWith, amount: billTotal }] : []);
      if (requestedPayments) {
        const received = Math.round(requestedPayments.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
        if (Math.abs(received - billTotal) > 0.009) {
          const gap = Math.round((billTotal - received) * 100) / 100;
          throw Object.assign(new Error(gap > 0 ? `Faltam ${formatBRL(gap)} para fechar a conta de ${formatBRL(billTotal)}.` : `Os pagamentos passam ${formatBRL(-gap)} do total de ${formatBRL(billTotal)}. Registre só o valor da conta (o troco não entra).`), { status: 409, code: "payments_mismatch" });
        }
      }
      const paidLabel = payments.length > 1 ? describePayments(payments) : paidWith ? PAID_LABELS[paidWith] : "";
      const toDeliver = ownOrders.filter((doc: Db) => doc.data().status === "ready" || KITCHEN_PENDING.has(doc.data().status));
      const payment = (doc: Db) => (paidWith && doc.data().status !== "cancelled" ? { paidWith, paidAt: now, paymentStatus: `pago no caixa (${paidLabel})`, financialReceiptConfirmed: true } : {});
      toDeliver.forEach((doc: Db) => tx.update(doc.ref, { status: "delivered", deliveredAt: now, readyAt: doc.data().readyAt ?? now, autoDelivered: true, ...payment(doc), updatedAt: now }));
      if (paidWith) {
        const deliveredIds = new Set(toDeliver.map((doc: Db) => doc.id));
        ownOrders.filter((doc: Db) => !deliveredIds.has(doc.id) && doc.data().status !== "cancelled").forEach((doc: Db) => tx.update(doc.ref, { ...payment(doc), updatedAt: now }));
      }

      const sessionBelongs = sessionSnap?.exists && sessionSnap.data().restaurantId === staff.staffUser.restaurantId;
      // Non-fiscal receipt ("comprovante"), numbered per restaurant. Only for attendances with something consumed.
      let receipt: { id: string; number: number; url: string } | null = null;
      if (sessionBelongs && sessionSnap.data().status !== "closed" && ownOrders.some((doc: Db) => doc.data().status !== "cancelled")) {
        const restaurant = restaurantSnap?.exists ? restaurantSnap.data() : {};
        const number = Number(restaurant.receiptSeq ?? 0) + 1;
        const receiptRef = db.collection("receipts").doc();
        const totals = receiptLines(ownOrders.map((doc: Db) => doc.data()));
        const publicToken = newReceiptToken();
        const doc: ReceiptDoc = {
          restaurantId: staff.staffUser.restaurantId, number, sessionId: sessionId as string, tableId: tableSnap.id, tableNumber: Number(table.number ?? 0), tableLabel: String(table.label ?? `Mesa ${table.number}`),
          openedAt: sessionSnap.data().startedAt ?? null, closedAt: now, ...totals, payments, courtesy: payments.length === 0,
          issuer: { name: String(restaurant.name ?? "Restaurante"), legalName: restaurant.legalName ?? null, document: restaurant.document ?? null, address: restaurant.address || null, phone: restaurant.phone || null },
          closedByName: staff.staffUser.name ?? null, publicToken, createdAt: now
        };
        tx.set(receiptRef, doc);
        tx.set(restaurantRef, { receiptSeq: number, updatedAt: now }, { merge: true });
        receipt = { id: receiptRef.id, number, url: receiptPath(receiptRef.id, publicToken) };
      }
      if (sessionBelongs && sessionSnap.data().status !== "closed") {
        tx.update(sessionSnap.ref, { status: "closed", closedAt: now, closedDateKey: toRestaurantDateKey(new Date(now)), closedBy: staff.staffUser.id, closeReason: reason, staffAccessCode: null, billTotal, paidWith, payments, ...(receipt ? { receiptId: receipt.id, receiptNumber: receipt.number, receiptUrl: receipt.url } : {}), updatedAt: now });
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
        metadata: { reason, paidWith, payments, billTotal, revokedGrantCount: openGrants.length, autoDelivered: toDeliver.length, forcedKitchen: inKitchen.length, recovered: !sessionBelongs }, createdAt: now
      });
      return { replay: alreadyFree, recovered: !sessionBelongs, autoDelivered: toDeliver.length, billTotal, paidWith, payments, receipt };
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
