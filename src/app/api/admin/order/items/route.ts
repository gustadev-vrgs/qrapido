import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { FLOOR_ROLES, requireStaffRequest } from "@/lib/server/admin-auth";
import { withApiErrors } from "@/lib/server/api-errors";
import { writeAudit } from "@/lib/server/audit";

type Db = any;

const schema = z.object({
  orderId: z.string().trim().min(1).max(128),
  itemIndex: z.number().int().min(0).max(100),
  /** New quantity for that line; 0 takes the line out. Only lowering is allowed. */
  quantity: z.number().int().min(0).max(20),
  reason: z.string().trim().min(4).max(300)
}).strict();

const money = (value: number) => Math.round(value * 100) / 100;

class Refusal extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/**
 * Takes items out of an order while the table is still open ("só um refrigerante",
 * "o prato veio errado, não cobrar"). Totals are recalculated with the order's own
 * service fee; taking everything out is a cancellation instead. Every change keeps a
 * reason in the order history and in the audit log, since it lowers the bill.
 */
async function handler(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, FLOOR_ROLES);
  if (staff instanceof NextResponse) return staff;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.some((issue) => issue.path[0] === "reason") ? "Informe o motivo (mínimo 4 letras)." : "Pedido inválido.", code: "invalid_body" }, { status: 400 });
  const { orderId, itemIndex, quantity, reason } = parsed.data;
  const db = getAdminFirestore() as Db;
  const orderRef = db.collection("orders").doc(orderId);

  try {
    const result = await db.runTransaction(async (tx: Db) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists || snap.data().restaurantId !== staff.staffUser.restaurantId) throw new Refusal("Pedido não encontrado.", 404);
      const order = snap.data();
      if (order.status === "cancelled") throw new Refusal("Este pedido já foi cancelado.", 409);
      const sessionSnap = order.sessionId ? await tx.get(db.collection("tableSessions").doc(order.sessionId)) : null;
      if (sessionSnap?.exists && sessionSnap.data().status === "closed") throw new Refusal("A conta desta mesa já foi fechada: não dá para mudar o pedido.", 409);
      const items: Db[] = Array.isArray(order.items) ? order.items : [];
      const line = items[itemIndex];
      if (!line) throw new Refusal("Item não encontrado. Atualize a tela.", 404);
      const before = Number(line.quantity ?? 0);
      if (quantity >= before) throw new Refusal("Só dá para diminuir a quantidade.", 400);

      const next = items
        .map((item, index) => (index === itemIndex ? { ...item, quantity, total: money(Number(item.priceSnapshot ?? 0) * quantity) } : item))
        .filter((item) => Number(item.quantity) > 0);
      if (next.length === 0) throw new Refusal("Para tirar tudo, cancele o pedido.", 409);

      const feeRate = Number(order.subtotal) > 0 ? Number(order.serviceFee ?? 0) / Number(order.subtotal) : 0;
      const subtotal = money(next.reduce((sum, item) => sum + Number(item.total ?? 0), 0));
      const serviceFee = money(subtotal * feeRate);
      const total = money(subtotal + serviceFee);
      const now = new Date().toISOString();
      const what = `${before - quantity}x ${line.nameSnapshot}`;
      tx.update(orderRef, { items: next, subtotal, serviceFee, total, updatedAt: now });
      tx.set(db.collection("orderEvents").doc(), { restaurantId: order.restaurantId, orderId, tableId: order.tableId, sessionId: order.sessionId, type: "order_items_changed", actorType: "staff", actorId: staff.staffUser.id, message: `Tirou ${what} do pedido`, metadata: { itemIndex, name: line.nameSnapshot, from: before, to: quantity, reason, previousTotal: order.total, total }, createdAt: now });
      return { what, tableNumber: order.tableNumber, orderCode: order.orderCode, previousTotal: Number(order.total), total };
    });
    await writeAudit(db, { restaurantId: staff.staffUser.restaurantId, actorId: staff.staffUser.id, actorName: staff.staffUser.name ?? null, type: "order_items_removed", message: `Mesa ${result.tableNumber}, pedido ${result.orderCode}: tirou ${result.what} (${reason})`, metadata: { orderId, previousTotal: result.previousTotal, total: result.total } });
    return NextResponse.json({ ok: true, total: result.total, requestId: staff.requestId });
  } catch (error) {
    if (error instanceof Refusal) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export const POST = withApiErrors("admin/order/items", handler, "Não foi possível alterar o pedido.");

export const dynamic = "force-dynamic";
