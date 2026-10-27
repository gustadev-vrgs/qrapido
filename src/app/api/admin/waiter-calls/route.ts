import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { FLOOR_ROLES, requireStaffRequest } from "@/lib/server/admin-auth";
import { withApiErrors } from "@/lib/server/api-errors";

const actionSchema = z.object({
  callId: z.string().min(1).max(128),
  action: z.enum(["attend", "complete"]),
}).strict();

/** Open calls only, through two equality queries so no composite index is required. */
async function listOpenCalls(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, FLOOR_ROLES);
  if (staff instanceof NextResponse) return staff;
  const db = getAdminFirestore() as any;
  const base = db.collection("waiterCalls").where("restaurantId", "==", staff.staffUser.restaurantId);
  const [pending, attending] = await Promise.all([base.where("status", "==", "pending").get(), base.where("status", "==", "attending").get()]);
  const calls = [...pending.docs, ...attending.docs]
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 100);
  return NextResponse.json({ calls }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = withApiErrors("admin/waiter-calls", listOpenCalls, "Não foi possível carregar os chamados.");

export async function POST(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, FLOOR_ROLES);
  if (staff instanceof NextResponse) return staff;
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ação de chamado inválida." }, { status: 400 });
  const db = getAdminFirestore() as any;
  const ref = db.collection("waiterCalls").doc(parsed.data.callId);
  try {
    const result = await db.runTransaction(async (tx: any) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists || snapshot.data().restaurantId !== staff.staffUser.restaurantId) throw Object.assign(new Error("Chamado não encontrado."), { status: 404 });
      const call = snapshot.data();
      // "complete" also works straight from "pending": the waiter solved it at the table with one tap.
      const expected = parsed.data.action === "attend" ? ["pending"] : ["pending", "attending"];
      const target = parsed.data.action === "attend" ? "attending" : "completed";
      if (call.status === target) return { status: target, replay: true };
      if (!expected.includes(call.status)) throw Object.assign(new Error("Este chamado já mudou de status. Atualize a fila."), { status: 409 });
      const now = new Date().toISOString();
      const fields = parsed.data.action === "attend"
        ? { status: target, attendedAt: now, attendedBy: staff.staffUser.id, updatedAt: now }
        : { status: target, completedAt: now, completedBy: staff.staffUser.id, updatedAt: now };
      tx.update(ref, fields);
      if (parsed.data.action === "complete" && call.lockId) tx.delete(db.collection("waiterCallLocks").doc(call.lockId));
      tx.set(db.collection("orderEvents").doc(), { restaurantId: call.restaurantId, orderId: `waiter-call:${snapshot.id}`, tableId: call.tableId, sessionId: call.sessionId, type: "order_updated", actorType: "staff", actorId: staff.staffUser.id, message: parsed.data.action === "attend" ? "Chamado em atendimento" : "Chamado concluído", metadata: { waiterCallId: snapshot.id, waiterCallStatus: target, reason: call.reason }, createdAt: now });
      return { status: target, replay: false };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const status = Number((error as { status?: number }).status ?? 500);
    return NextResponse.json({ error: status === 500 ? "Não foi possível atualizar o chamado." : (error as Error).message }, { status });
  }
}

export const dynamic = "force-dynamic";
