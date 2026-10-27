import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { FLOOR_ROLES, logAdminFailure, requireStaffRequest } from "@/lib/server/admin-auth";
import { classifyServerError } from "@/lib/server/api-errors";
import { CartError, readCartItems, writeCartOrders } from "@/lib/server/place-order";
import { stableHash } from "@/lib/server/public-api-security";

const itemSchema = z.object({ menuItemId: z.string().trim().min(1).max(128), quantity: z.number().int().min(1).max(50), notes: z.string().trim().max(180).nullable().optional() }).strict();
const payloadSchema = z.object({
  tableId: z.string().trim().min(1).max(128),
  items: z.array(itemSchema).min(1).max(40),
  customerName: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional()
}).strict();

type Db = any;

/**
 * Order taken by the waiter for customers who prefer not to use the phone.
 * Same pricing and kitchen/drinks split as the customer's order; the table must
 * be open. The order limit and the customer time limit do not apply to staff.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, FLOOR_ROLES);
  if (staff instanceof NextResponse) return staff;
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!parsed.success || !/^[a-zA-Z0-9_-]{16,128}$/.test(idempotencyKey)) return NextResponse.json({ error: "Pedido inválido. Confira os itens e tente novamente.", code: "invalid_payload" }, { status: 400 });
  const restaurantId = staff.staffUser.restaurantId;

  const db = getAdminFirestore() as Db;
  const contentHash = stableHash(JSON.stringify(parsed.data));
  const idempotencyRef = db.collection("orderIdempotency").doc(stableHash(`staff:${parsed.data.tableId}:${idempotencyKey}`));
  const settings = await db.collection("restaurantSettings").where("restaurantId", "==", restaurantId).limit(1).get();
  const configuration = settings.empty ? {} : settings.docs[0].data();
  const serviceFeePercent = Number(configuration.serviceFeePercent ?? 0);
  if (!Number.isFinite(serviceFeePercent) || serviceFeePercent < 0 || serviceFeePercent > 100) return NextResponse.json({ error: "Configuração de taxa inválida." }, { status: 503 });
  const accepted: string[] = Array.isArray(configuration.acceptedPaymentMethods) ? configuration.acceptedPaymentMethods : [];
  // The real payment method is chosen at the cashier when the bill is closed.
  const paymentMethod = accepted.includes("cash") || accepted.length === 0 ? "cash" : accepted[0];

  try {
    const result = await db.runTransaction(async (tx: Db) => {
      const nowMs = Date.now();
      const now = new Date(nowMs).toISOString();
      const tableRef = db.collection("tables").doc(parsed.data.tableId);
      const [idemSnap, tableSnap] = await Promise.all([tx.get(idempotencyRef), tx.get(tableRef)]);
      if (idemSnap.exists) {
        const idem = idemSnap.data();
        if (idem.contentHash !== contentHash) throw Object.assign(new Error("Os itens mudaram durante o envio. Confirme o pedido de novo."), { status: 409, code: "idempotency_conflict" });
        return { orderId: idem.orderId, orderCode: idem.orderCode, groupCode: idem.groupCode, orders: idem.orders, subtotal: idem.subtotal, serviceFee: idem.serviceFee, total: idem.total, replay: true };
      }
      const table = tableSnap.exists ? tableSnap.data() : null;
      if (!table || table.restaurantId !== restaurantId) throw Object.assign(new Error("Mesa não encontrada."), { status: 404 });
      const sessionId: string | null = table.currentSessionGroupId ?? null;
      if (!sessionId || table.status !== "active") throw Object.assign(new Error("Abra a mesa antes de lançar o pedido."), { status: 409, code: "no_session" });
      const sessionSnap = await tx.get(db.collection("tableSessions").doc(sessionId));
      const session = sessionSnap.exists ? sessionSnap.data() : null;
      if (!session || session.restaurantId !== restaurantId || session.status !== "active") throw Object.assign(new Error("Abra a mesa antes de lançar o pedido."), { status: 409, code: "no_session" });

      const items = await readCartItems(tx, db, restaurantId, parsed.data.items);
      const summary = writeCartOrders(tx, db, {
        restaurantId,
        session: { id: sessionId, tableId: tableSnap.id, tableNumber: Number(session.tableNumber ?? table.number), sessionToken: String(session.sessionToken ?? ""), customerName: session.customerName ?? null, completedOrdersCount: Number(session.completedOrdersCount ?? 0) },
        items, serviceFeePercent,
        customerName: parsed.data.customerName || null, notes: parsed.data.notes || null,
        paymentMethod, paymentMode: "waiter", changeFor: null,
        contentHash, actor: { type: "staff", id: staff.staffUser.id }, nowMs
      });
      tx.set(idempotencyRef, { sessionId, staffId: staff.staffUser.id, contentHash, ...summary, createdAt: now, expiresAt: new Date(nowMs + 24 * 3600_000).toISOString() });
      return { ...summary, replay: false };
    });
    return NextResponse.json({ ...result, requestId: staff.requestId }, { status: result.replay ? 200 : 201 });
  } catch (error) {
    if (error instanceof CartError) return NextResponse.json({ error: "Um dos produtos ficou indisponível. Remova-o e tente de novo.", code: "item_unavailable" }, { status: 409 });
    const failure = error as { status?: number; code?: string };
    if (failure.status && failure.status !== 500) return NextResponse.json({ error: (error as Error).message, code: failure.code, requestId: staff.requestId }, { status: failure.status });
    logAdminFailure(staff.requestId, "create_staff_order", error);
    const classified = classifyServerError(error);
    return NextResponse.json({ error: "Não foi possível lançar o pedido; nada foi salvo.", code: classified.code, hint: classified.hint, requestId: staff.requestId }, { status: classified.status });
  }
}
