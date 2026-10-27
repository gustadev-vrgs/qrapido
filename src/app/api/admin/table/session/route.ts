import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { FLOOR_ROLES, logAdminFailure, requireStaffRequest } from "@/lib/server/admin-auth";
import { classifyServerError } from "@/lib/server/api-errors";
import { DEFAULT_SESSION_DURATION_MINUTES } from "@/lib/server/public-session";

const schema = z.object({
  tableId: z.string().min(1).max(128),
  action: z.enum(["renew", "expire", "people"]),
  /** For action "people": how many people are at the table (set after the one-tap opening). */
  peopleCount: z.number().int().min(1).max(60).optional(),
  durationMinutes: z.number().int().min(15).max(720).optional(),
  /** null removes the limit; undefined keeps the current one. */
  orderLimit: z.number().int().min(1).max(100).nullable().optional(),
  /** Legacy fields still accepted from older panels. */
  maxOrdersAllowed: z.number().int().min(1).max(100).optional(),
  orderLimitEnabled: z.boolean().optional(),
  reason: z.string().trim().max(300).optional()
}).strict();
type Db = any;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, FLOOR_ROLES);
  if (staff instanceof NextResponse) return staff;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ação ou limites inválidos." }, { status: 400 });
  const db = getAdminFirestore() as Db;
  const tableRef = db.collection("tables").doc(parsed.data.tableId);
  try {
    const result = await db.runTransaction(async (tx: Db) => {
      const tableSnap = await tx.get(tableRef);
      if (!tableSnap.exists || tableSnap.data().restaurantId !== staff.staffUser.restaurantId) throw Object.assign(new Error("Mesa não encontrada."), { status: 404 });
      const table = tableSnap.data();
      if (!table.currentSessionGroupId) throw Object.assign(new Error("Esta mesa não tem atendimento. Use \"Abrir mesa\"."), { status: 409 });
      const sessionRef = db.collection("tableSessions").doc(table.currentSessionGroupId);
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists || sessionSnap.data().restaurantId !== staff.staffUser.restaurantId || sessionSnap.data().status === "closed") throw Object.assign(new Error("Este atendimento já foi encerrado. Use \"Abrir mesa\"."), { status: 409 });

      const now = new Date();
      const nowIso = now.toISOString();
      if (parsed.data.action === "people") {
        if (!parsed.data.peopleCount) throw Object.assign(new Error("Informe quantas pessoas estão na mesa."), { status: 400 });
        tx.update(sessionRef, { peopleCount: parsed.data.peopleCount, updatedAt: nowIso });
        tx.update(tableRef, { currentPeopleCount: parsed.data.peopleCount, updatedAt: nowIso });
        return { peopleCount: parsed.data.peopleCount };
      }
      const renewing = parsed.data.action === "renew";
      const renewedExpiresAt = new Date(now.getTime() + (parsed.data.durationMinutes ?? DEFAULT_SESSION_DURATION_MINUTES) * 60_000).toISOString();
      const limit = parsed.data.orderLimit !== undefined
        ? parsed.data.orderLimit
        : parsed.data.orderLimitEnabled === false ? null : parsed.data.maxOrdersAllowed;
      const limitPatch = limit === undefined ? {} : { orderLimitEnabled: limit !== null, maxOrdersAllowed: limit ?? 0 };
      const sessionPatch = renewing
        ? { status: "active", expiresAt: renewedExpiresAt, ...limitPatch, updatedAt: nowIso }
        : { status: "expired", expiredAt: nowIso, updatedAt: nowIso };
      tx.update(sessionRef, sessionPatch);
      // The table stays occupied either way; "blocked" is reserved for disabled tables.
      tx.update(tableRef, { status: "active", updatedAt: nowIso });
      tx.set(db.collection("orderEvents").doc(), { restaurantId: staff.staffUser.restaurantId, tableId: tableSnap.id, sessionId: sessionSnap.id, orderId: "system", type: renewing ? "session_renewed" : "session_expired", actorType: "staff", actorId: staff.staffUser.id, message: renewing ? "Atendimento renovado" : "Novos pedidos pausados pela equipe", metadata: { reason: parsed.data.reason ?? null, durationMinutes: parsed.data.durationMinutes ?? null, orderLimit: limit ?? null }, createdAt: nowIso });
      return { expiresAt: renewing ? renewedExpiresAt : sessionSnap.data().expiresAt };
    });
    return NextResponse.json({ ok: true, ...result, requestId: staff.requestId });
  } catch (error) {
    const status = Number((error as { status?: number }).status ?? 500);
    if (status !== 500) return NextResponse.json({ error: (error as Error).message, requestId: staff.requestId }, { status });
    logAdminFailure(staff.requestId, "session_action", error);
    const failure = classifyServerError(error);
    return NextResponse.json({ error: "Não foi possível alterar o atendimento.", code: failure.code, hint: failure.hint, requestId: staff.requestId }, { status: failure.status });
  }
}
