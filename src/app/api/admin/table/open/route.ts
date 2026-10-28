import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { FLOOR_ROLES, forbiddenResource, logAdminFailure, requireStaffRequest } from "@/lib/server/admin-auth";
import { classifyServerError } from "@/lib/server/api-errors";
import { createAttendanceCode, createPublicTableToken, createSessionToken, DEFAULT_SESSION_DURATION_MINUTES, resolveSettings } from "@/lib/server/public-session";
import { RESTAURANT_TIME_ZONE } from "@/lib/utils/date-key";
import { buildPublicTableUrl, isValidPublicTableToken } from "@/lib/utils/public-url";

const payloadSchema = z.object({
  tableId: z.string().min(1).max(128),
  peopleCount: z.number().int().min(1).max(60).optional(),
  /** Legacy name for peopleCount, still sent by older panels. */
  currentPeopleCount: z.number().int().min(1).max(60).optional(),
  /** Optional cap on orders for this attendance; null or absent means no limit. */
  orderLimit: z.number().int().min(1).max(100).nullable().optional(),
  durationMinutes: z.number().int().min(15).max(720).optional(),
  notes: z.string().max(500).optional()
});

type Db = any;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, FLOOR_ROLES);
  if (staff instanceof NextResponse) return staff;

  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos para abrir a mesa.", requestId: staff.requestId }, { status: 400 });

  const peopleCount = parsed.data.peopleCount ?? parsed.data.currentPeopleCount ?? 1;
  const orderLimit = parsed.data.orderLimit ?? null;
  const db = getAdminFirestore() as Db;
  const tableRef = db.collection("tables").doc(parsed.data.tableId);
  const sessionRef = db.collection("tableSessions").doc();
  const attendanceCode = createAttendanceCode();

  try {
    const settings = await resolveSettings(staff.staffUser.restaurantId);
    const durationMinutes = parsed.data.durationMinutes ?? Math.min(720, Math.max(15, Number(settings?.defaultSessionDurationMinutes) || DEFAULT_SESSION_DURATION_MINUTES));

    const result = await db.runTransaction(async (tx: Db) => {
      const tableSnap = await tx.get(tableRef);
      if (!tableSnap.exists) throw Object.assign(new Error("Mesa não encontrada."), { status: 404 });
      const table = { id: tableSnap.id, ...tableSnap.data() };
      if (table.restaurantId !== staff.staffUser.restaurantId) throw Object.assign(new Error("restaurant_mismatch"), { status: 403 });
      if (table.isActive === false) throw Object.assign(new Error("Esta mesa está desativada. Ative-a em Mesas antes de abrir."), { status: 409 });

      // Only attendances that may still be open: reading every attendance the table
      // ever had grew with the history and made opening a table slower each month.
      // Equality-only queries: no composite index needed.
      const openSnaps = await Promise.all(["active", "idle"].map((status) => tx.get(db.collection("tableSessions").where("tableId", "==", table.id).where("status", "==", status))));
      const nowMs = Date.now();
      const sessions = openSnaps.flatMap((snap: Db) => snap.docs).map((doc: Db) => ({ ref: doc.ref, id: doc.id, ...doc.data() }));
      const live = sessions.find((session: Db) => session.status === "active" && new Date(session.expiresAt).getTime() > nowMs);
      if (live) throw Object.assign(new Error("Esta mesa já tem um atendimento aberto. Use \"Novo código\" para gerar outro código ou encerre a mesa."), { status: 409 });

      const now = new Date(nowMs).toISOString();
      const expiresAt = new Date(nowMs + durationMinutes * 60_000).toISOString();
      // Attendances that ran out of time are finalized so the table can be reopened.
      sessions
        .filter((session: Db) => session.status === "active" || session.status === "idle")
        .forEach((session: Db) => tx.update(session.ref, { status: "expired", expiredAt: now, updatedAt: now }));

      const publicToken = isValidPublicTableToken(table.publicToken) ? table.publicToken : createPublicTableToken();
      const qrCodeValue = buildPublicTableUrl(publicToken, request.nextUrl.origin);
      tx.set(sessionRef, {
        restaurantId: table.restaurantId,
        tableId: table.id,
        tableNumber: Number(table.number) || 0,
        sessionToken: createSessionToken(),
        sessionLabel: `${String(table.label || `Mesa ${table.number}`).slice(0, 30)} - ${new Date(nowMs).toLocaleTimeString("pt-BR", { timeZone: RESTAURANT_TIME_ZONE, hour: "2-digit", minute: "2-digit" })}`,
        customerName: null,
        status: "active",
        deviceFingerprint: null,
        startedAt: now,
        expiresAt,
        closedAt: null,
        lastActivityAt: now,
        requestCountWindow: 0,
        peopleCount,
        orderLimitEnabled: orderLimit !== null,
        maxOrdersAllowed: orderLimit ?? 0,
        completedOrdersCount: 0,
        openedByStaffId: staff.staffUser.id,
        notes: parsed.data.notes?.trim() || null,
        accessCodeHash: attendanceCode.hash,
        accessCodeSalt: attendanceCode.salt,
        // Visible only to the restaurant's staff (Firestore rules): lets the team
        // read the code again instead of reopening the table when it is forgotten.
        staffAccessCode: attendanceCode.code,
        accessCodeIssuedAt: now,
        accessFailedAttempts: 0,
        accessLockedUntil: null,
        createdAt: now,
        updatedAt: now
      });
      tx.set(tableRef, {
        status: "active",
        currentPeopleCount: peopleCount,
        activeSessionCount: 1,
        currentSessionGroupId: sessionRef.id,
        publicToken,
        qrCodeValue,
        openedAt: now,
        closedAt: null,
        updatedAt: now
      }, { merge: true });
      tx.set(db.collection("orderEvents").doc(), { restaurantId: table.restaurantId, tableId: table.id, sessionId: sessionRef.id, orderId: "system", type: "table_opened", actorType: "staff", actorId: staff.staffUser.id, message: "Mesa aberta para atendimento", metadata: { peopleCount, orderLimit, expiresAt }, createdAt: now });
      return { expiresAt, qrCodeValue };
    });

    return NextResponse.json({ ok: true, sessionId: sessionRef.id, attendanceCode: attendanceCode.code, qrCodeValue: result.qrCodeValue, expiresAt: result.expiresAt, requestId: staff.requestId }, { status: 201, headers: { "x-request-id": staff.requestId, "Cache-Control": "no-store" } });
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    if (status === 403) return forbiddenResource(staff.requestId);
    if (status !== 500) return NextResponse.json({ error: (error as Error).message, requestId: staff.requestId }, { status });
    logAdminFailure(staff.requestId, "open_table", error);
    const failure = classifyServerError(error);
    return NextResponse.json({ error: "Não foi possível abrir o atendimento.", code: failure.code, hint: failure.hint, requestId: staff.requestId }, { status: failure.status, headers: { "x-request-id": staff.requestId } });
  }
}
