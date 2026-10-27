import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { FLOOR_ROLES, logAdminFailure, requireStaffRequest } from "@/lib/server/admin-auth";
import { classifyServerError } from "@/lib/server/api-errors";
import { computeSessionStatus, createAttendanceCode } from "@/lib/server/public-session";

const schema = z.object({ tableId: z.string().min(1).max(128) }).strict();
type Db = any;

/**
 * Issues a new 6-digit code for the table's current attendance. Phones already
 * authorized keep working; only the new code is accepted for new phones.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, FLOOR_ROLES);
  if (staff instanceof NextResponse) return staff;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Mesa inválida." }, { status: 400 });

  const db = getAdminFirestore() as Db;
  const tableRef = db.collection("tables").doc(parsed.data.tableId);
  const code = createAttendanceCode();
  try {
    await db.runTransaction(async (tx: Db) => {
      const tableSnap = await tx.get(tableRef);
      if (!tableSnap.exists || tableSnap.data().restaurantId !== staff.staffUser.restaurantId) throw Object.assign(new Error("Mesa não encontrada."), { status: 404 });
      const sessionId = tableSnap.data().currentSessionGroupId;
      if (!sessionId) throw Object.assign(new Error("Esta mesa não tem atendimento aberto. Abra a mesa primeiro."), { status: 409 });
      const sessionRef = db.collection("tableSessions").doc(sessionId);
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists || computeSessionStatus(sessionSnap.data()) !== "active") throw Object.assign(new Error("O atendimento desta mesa não está ativo. Renove ou encerre a mesa."), { status: 409 });
      const now = new Date().toISOString();
      tx.update(sessionRef, { accessCodeHash: code.hash, accessCodeSalt: code.salt, staffAccessCode: code.code, accessCodeIssuedAt: now, accessFailedAttempts: 0, updatedAt: now });
      tx.set(db.collection("orderEvents").doc(), { restaurantId: staff.staffUser.restaurantId, tableId: tableSnap.id, sessionId, orderId: "system", type: "access_code_renewed", actorType: "staff", actorId: staff.staffUser.id, message: "Novo código de acesso gerado", metadata: {}, createdAt: now });
    });
    return NextResponse.json({ ok: true, attendanceCode: code.code, requestId: staff.requestId }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = Number((error as { status?: number }).status ?? 500);
    if (status !== 500) return NextResponse.json({ error: (error as Error).message, requestId: staff.requestId }, { status });
    logAdminFailure(staff.requestId, "renew_code", error);
    const failure = classifyServerError(error);
    return NextResponse.json({ error: "Não foi possível gerar um novo código.", code: failure.code, hint: failure.hint, requestId: staff.requestId }, { status: failure.status });
  }
}
