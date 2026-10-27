import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { requireStaffRequest, STAFF_ROLES, logAdminFailure } from "@/lib/server/admin-auth";
import { classifyServerError } from "@/lib/server/api-errors";

// "Pronto" is one tap from "recebido"; the intermediate steps remain valid for older orders.
const transitions: Record<string, readonly string[]> = {
  received: ["confirmed", "in_preparation", "ready", "cancelled"],
  confirmed: ["in_preparation", "ready", "cancelled"],
  in_preparation: ["ready", "cancelled"],
  ready: ["delivered", "cancelled"],
  delivered: [],
  cancelled: []
};

const payloadSchema = z.object({
  orderId: z.string().min(1).max(128),
  nextStatus: z.enum(["confirmed", "in_preparation", "ready", "delivered", "cancelled"]),
  reason: z.string().trim().min(4).max(300).optional()
}).strict().superRefine((value, context) => {
  if (value.nextStatus === "cancelled" && !value.reason) context.addIssue({ code: z.ZodIssueCode.custom, message: "Motivo obrigatório." });
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, STAFF_ROLES);
  if (staff instanceof NextResponse) return staff;
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.some((issue) => issue.message === "Motivo obrigatório.") ? "Informe o motivo do cancelamento (mínimo 4 letras)." : "Status inválido." }, { status: 400 });

  const db = getAdminFirestore() as any;
  const orderRef = db.collection("orders").doc(parsed.data.orderId);
  try {
    const result = await db.runTransaction(async (tx: any) => {
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) throw Object.assign(new Error("Pedido não encontrado."), { status: 404 });
      const order = orderSnap.data();
      if (order.restaurantId !== staff.staffUser.restaurantId) throw Object.assign(new Error("Pedido não encontrado."), { status: 404 });
      if (order.status === parsed.data.nextStatus) return { replay: true, status: order.status };
      if (!transitions[order.status]?.includes(parsed.data.nextStatus)) throw Object.assign(new Error("Transição de pedido não permitida."), { status: 409 });

      const now = new Date().toISOString();
      const cancelling = parsed.data.nextStatus === "cancelled";
      // Only the first order of a cart counts toward the table quota (see public/order).
      let releaseQuota = cancelling && !order.quotaReleasedAt && order.quotaCounted !== false;
      const sessionRef = db.collection("tableSessions").doc(order.sessionId);
      if (releaseQuota) {
        const sessionSnap = await tx.get(sessionRef);
        if (sessionSnap.exists && sessionSnap.data().restaurantId === order.restaurantId && sessionSnap.data().orderLimitEnabled !== false) {
          tx.update(sessionRef, { completedOrdersCount: Math.max(0, Number(sessionSnap.data().completedOrdersCount ?? 0) - 1), updatedAt: now });
        } else releaseQuota = false;
      }
      const timestamps: Record<string, string> = {};
      if (parsed.data.nextStatus === "confirmed") timestamps.confirmedAt = now;
      if (parsed.data.nextStatus === "in_preparation") timestamps.preparationStartedAt = now;
      if (parsed.data.nextStatus === "ready") timestamps.readyAt = now;
      if (parsed.data.nextStatus === "delivered") timestamps.deliveredAt = now;
      if (cancelling) timestamps.cancelledAt = now;
      tx.update(orderRef, { status: parsed.data.nextStatus, ...timestamps, cancellationReason: cancelling ? parsed.data.reason : null, quotaReleasedAt: releaseQuota ? now : order.quotaReleasedAt ?? null, updatedAt: now });
      tx.set(db.collection("orderEvents").doc(), { restaurantId: order.restaurantId, orderId: orderSnap.id, tableId: order.tableId, sessionId: order.sessionId, type: cancelling ? "order_cancelled" : "order_updated", actorType: "staff", actorId: staff.staffUser.id, message: cancelling ? "Pedido cancelado pela operação" : "Status do pedido atualizado", metadata: { previousStatus: order.status, nextStatus: parsed.data.nextStatus, reason: parsed.data.reason ?? null, quotaReleased: releaseQuota }, createdAt: now });
      return { replay: false, status: parsed.data.nextStatus };
    });
    return NextResponse.json({ ok: true, ...result, requestId: staff.requestId });
  } catch (error) {
    const status = Number((error as { status?: number }).status ?? 500);
    if (status !== 500) return NextResponse.json({ error: (error as Error).message, requestId: staff.requestId }, { status });
    logAdminFailure(staff.requestId, "order_transition", error);
    const failure = classifyServerError(error);
    return NextResponse.json({ error: "Não foi possível atualizar o pedido.", code: failure.code, hint: failure.hint, requestId: staff.requestId }, { status: failure.status });
  }
}
