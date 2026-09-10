import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { requireStaffRequest } from "@/lib/server/admin-auth";

const actionSchema = z.object({
  callId: z.string().min(1).max(128),
  action: z.enum(["attend", "complete"]),
}).strict();

export async function GET(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, ["admin", "manager", "attendant"]);
  if (staff instanceof NextResponse) return staff;
  const db = getAdminFirestore() as any;
  const snapshot = await db.collection("waiterCalls")
    .where("restaurantId", "==", staff.staffUser.restaurantId)
    .orderBy("createdAt", "desc").limit(100).get();
  return NextResponse.json({ calls: snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, ["admin", "manager", "attendant"]);
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
      const expected = parsed.data.action === "attend" ? "pending" : "attending";
      const target = parsed.data.action === "attend" ? "attending" : "completed";
      if (call.status === target) return { status: target, replay: true };
      if (call.status !== expected) throw Object.assign(new Error("Este chamado já mudou de status. Atualize a fila."), { status: 409 });
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
