import crypto from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { createOperationalEvent, createSessionToken, resolveSettings, resolveTable } from "@/lib/server/public-session";
import { buildPublicTableUrl } from "@/lib/utils/public-url";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { requireStaffRequest, ADMIN_ROLES } from "@/lib/server/admin-auth";

const DEFAULT_SESSION_DURATION_MINUTES = 90;

const payloadSchema = z.object({
  tableId: z.string().min(1),
  label: z.string().min(1),
  number: z.number().int().positive(),
  capacity: z.number().int().positive(),
  currentPeopleCount: z.number().int().positive(),
  activeSessionLimit: z.number().int().positive().max(40),
  pinCode: z.string().length(4).nullable().optional(),
  notes: z.string().max(500).optional()
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, ADMIN_ROLES);
  if (staff instanceof NextResponse) return staff;

  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos para abertura da mesa." }, { status: 400 });
  }

  if (parsed.data.currentPeopleCount > parsed.data.capacity) {
    return NextResponse.json({ error: "A quantidade de pessoas não pode ser maior que a capacidade da mesa." }, { status: 400 });
  }

  const table = await resolveTable(parsed.data.tableId);
  if (!table) {
    return NextResponse.json({ error: "Mesa não encontrada." }, { status: 404 });
  }

  if (table.isActive === false || table.status === "blocked") {
    return NextResponse.json({ error: "Esta mesa está inativa." }, { status: 400 });
  }

  const db = getAdminFirestore() as any;
  const settings = await resolveSettings(table.restaurantId);
  const sessionDurationMinutes = settings?.defaultSessionDurationMinutes ?? DEFAULT_SESSION_DURATION_MINUTES;
  const now = new Date();
  const openedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + sessionDurationMinutes * 60_000).toISOString();
  const sessionToken = createSessionToken();
  const publicToken = table.publicToken ?? crypto.randomBytes(32).toString("base64url");
  const qrCodeValue = buildPublicTableUrl(publicToken, request.nextUrl.origin);
  const tableRef = db.collection("tables").doc(table.id);
  const sessionRef = db.collection("tableSessions").doc();

  try {
    await db.runTransaction(async (transaction: any) => {
      const freshTableDoc = await transaction.get(tableRef);
      if (!freshTableDoc.exists) {
        throw Object.assign(new Error("Mesa não encontrada."), { status: 404 });
      }

      const freshTable = { id: freshTableDoc.id, ...freshTableDoc.data() } as any;
      if (freshTable.isActive === false || freshTable.status === "blocked") {
        throw Object.assign(new Error("Esta mesa está inativa."), { status: 400 });
      }

      const activeSessionsQuery = db
        .collection("tableSessions")
        .where("tableId", "==", table.id)
        .where("status", "in", ["active", "idle"]);
      const activeSessionsSnapshot = await transaction.get(activeSessionsQuery);

      if (!activeSessionsSnapshot.empty || freshTable.status === "active") {
        throw Object.assign(new Error("Esta mesa já possui um atendimento aberto."), { status: 409 });
      }

      transaction.set(sessionRef, {
        restaurantId: table.restaurantId,
        tableId: table.id,
        tableNumber: parsed.data.number,
        sessionToken,
        sessionLabel: `${parsed.data.label || `Mesa ${parsed.data.number}`} - ${now.toLocaleTimeString("pt-BR")}`,
        customerName: null,
        status: "active",
        deviceFingerprint: null,
        startedAt: openedAt,
        openedAt: FieldValue.serverTimestamp(),
        expiresAt,
        closedAt: null,
        lastActivityAt: openedAt,
        requestCountWindow: 0,
        peopleCount: parsed.data.currentPeopleCount,
        maxOrdersAllowed: parsed.data.currentPeopleCount,
        completedOrdersCount: 0,
        openedByStaffId: staff.staffUser.id,
        notes: parsed.data.notes ?? null,
        createdAt: openedAt,
        updatedAt: openedAt
      });

      transaction.set(
        tableRef,
        {
          label: parsed.data.label,
          number: parsed.data.number,
          capacity: parsed.data.capacity,
          currentPeopleCount: parsed.data.currentPeopleCount,
          activeSessionLimit: parsed.data.activeSessionLimit,
          pinCode: parsed.data.pinCode ?? null,
          status: "active",
          openedAt,
          openedAtServer: FieldValue.serverTimestamp(),
          closedAt: null,
          activeSessionCount: 1,
          currentSessionGroupId: sessionRef.id,
          publicToken,
          qrCodeValue,
          updatedAt: openedAt
        },
        { merge: true }
      );
    });
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    const message = error instanceof Error ? error.message : "Não foi possível abrir o atendimento. Tente novamente.";
    if (status === 500 && process.env.NODE_ENV === "development") console.error("Open table failed", error);
    return NextResponse.json({ error: status === 500 ? "Não foi possível abrir o atendimento. Tente novamente." : message }, { status });
  }

  await createOperationalEvent({
    restaurantId: table.restaurantId,
    tableId: table.id,
    sessionId: sessionRef.id,
    type: "table_opened",
    message: "Mesa aberta para atendimento",
    metadata: { qrCodeValue }
  });

  await createOperationalEvent({
    restaurantId: table.restaurantId,
    tableId: table.id,
    sessionId: sessionRef.id,
    type: "session_created",
    message: "Sessão temporária criada para mesa aberta",
    metadata: { expiresAt }
  });

  return NextResponse.json({ ok: true, sessionId: sessionRef.id, sessionToken, qrCodeValue }, { status: 201 });
}
