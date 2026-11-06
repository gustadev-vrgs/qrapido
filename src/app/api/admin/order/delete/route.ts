import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { OWNER_ROLES, requireStaffRequest } from "@/lib/server/admin-auth";
import { withApiErrors } from "@/lib/server/api-errors";
import { writeAudit } from "@/lib/server/audit";

type Db = any;

const schema = z.object({
  orderId: z.string().trim().min(1).max(128),
  reason: z.string().trim().min(4).max(300)
}).strict();

/** Only finished orders: one still in the kitchen or on its way is cancelled first. */
const DELETABLE = new Set(["delivered", "cancelled"]);

/**
 * Deletes one finished order (and its history and alerts) for good. Administrator only,
 * with a reason; a full copy of the order goes to the audit log, so a deletion can
 * always be traced. A receipt already issued keeps its own copy and does not change.
 */
async function handler(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, OWNER_ROLES);
  if (staff instanceof NextResponse) return staff;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.some((issue) => issue.path[0] === "reason") ? "Informe o motivo (mínimo 4 letras)." : "Pedido inválido.", code: "invalid_body" }, { status: 400 });
  const { orderId, reason } = parsed.data;
  const restaurantId = staff.staffUser.restaurantId;
  const db = getAdminFirestore() as Db;

  const orderRef = db.collection("orders").doc(orderId);
  const snap = await orderRef.get();
  if (!snap.exists || snap.data().restaurantId !== restaurantId) return NextResponse.json({ error: "Pedido não encontrado. Atualize a tela." }, { status: 404 });
  const order = snap.data();
  if (!DELETABLE.has(order.status)) return NextResponse.json({ error: "Este pedido ainda está em andamento: cancele antes de excluir.", code: "order_open" }, { status: 409 });

  const [events, alerts] = await Promise.all([
    db.collection("orderEvents").where("orderId", "==", orderId).get(),
    db.collection("adminAlerts").where("orderId", "==", orderId).get()
  ]);
  const own = (docs: Db[]) => docs.filter((doc) => doc.data().restaurantId === restaurantId);
  await Promise.all([...own(events.docs), ...own(alerts.docs)].map((doc: Db) => doc.ref.delete()));
  await orderRef.delete();

  const items = (Array.isArray(order.items) ? order.items : []).map((item: Db) => `${item.quantity}x ${item.nameSnapshot}`).join(", ");
  await writeAudit(db, {
    restaurantId, actorId: staff.staffUser.id, actorName: staff.staffUser.name ?? null, type: "order_deleted",
    message: `Excluiu o pedido ${order.orderCode} da mesa ${order.tableNumber} (${order.status === "cancelled" ? "cancelado" : "entregue"}, R$ ${Number(order.total ?? 0).toFixed(2).replace(".", ",")}): ${reason}`,
    metadata: { orderId, reason, order: { orderCode: order.orderCode, tableNumber: order.tableNumber, sessionId: order.sessionId, status: order.status, items, subtotal: order.subtotal, serviceFee: order.serviceFee, total: order.total, receivedAt: order.receivedAt ?? order.createdAt ?? null } }
  });
  return NextResponse.json({ ok: true, requestId: staff.requestId });
}

export const POST = withApiErrors("admin/order/delete", handler, "Não foi possível excluir o pedido.");

export const dynamic = "force-dynamic";
