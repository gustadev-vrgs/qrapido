import crypto from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createOperationalEvent, createSessionForTable, resolveTable } from "@/lib/server/public-session";
import { buildPublicTableUrl } from "@/lib/utils/public-url";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { requireStaffRequest, ADMIN_ROLES } from "@/lib/server/admin-auth";

const payloadSchema = z.object({
  tableId: z.string().min(1),
  label: z.string().min(1),
  number: z.number().int().positive(),
  capacity: z.number().int().positive(),
  currentPeopleCount: z.number().int().positive(),
  activeSessionLimit: z.number().int().positive().max(40),
  pinCode: z.string().length(4).nullable().optional(),
  notes: z.string().max(500).optional(),
  openedByStaffId: z.string().nullable().optional()
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, ADMIN_ROLES);
  if (staff instanceof NextResponse) return staff;

  const parsed = payloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const table = await resolveTable(parsed.data.tableId);
  if (!table) {
    return NextResponse.json({ error: "Mesa não encontrada." }, { status: 404 });
  }

  const db = getAdminFirestore() as any;
  const activeSessionsSnapshot = await db
    .collection("tableSessions")
    .where("tableId", "==", table.id)
    .where("status", "in", ["active", "idle"])
    .get();

  if (!activeSessionsSnapshot.empty || table.status === "active") {
    return NextResponse.json({ error: "Já existe um atendimento ativo para esta mesa." }, { status: 409 });
  }

  const openedAt = new Date().toISOString();

  const createdSession = await createSessionForTable({
    restaurantId: table.restaurantId,
    table,
    peopleCount: parsed.data.currentPeopleCount,
    notes: parsed.data.notes ?? null,
    openedByStaffId: parsed.data.openedByStaffId ?? null
  });
  const publicToken = table.publicToken ?? crypto.randomBytes(32).toString("base64url");
  const qrCodeValue = buildPublicTableUrl(publicToken, request.nextUrl.origin);

  await db.collection("tables").doc(table.id).set(
    {
      label: parsed.data.label,
      number: parsed.data.number,
      capacity: parsed.data.capacity,
      currentPeopleCount: parsed.data.currentPeopleCount,
      activeSessionLimit: parsed.data.currentPeopleCount,
      pinCode: parsed.data.pinCode ?? null,
      status: "active",
      openedAt,
      closedAt: null,
      activeSessionCount: activeSessionsSnapshot.size + 1,
      currentSessionGroupId: createdSession.sessionId,
      publicToken,
      qrCodeValue,
      updatedAt: openedAt
    },
    { merge: true }
  );

  await createOperationalEvent({
    restaurantId: table.restaurantId,
    tableId: table.id,
    sessionId: createdSession.sessionId,
    type: "table_opened",
    message: "Mesa aberta para atendimento",
    metadata: { qrCodeValue }
  });

  await createOperationalEvent({
    restaurantId: table.restaurantId,
    tableId: table.id,
    sessionId: createdSession.sessionId,
    type: "session_created",
    message: "Sessão temporária criada para mesa aberta",
    metadata: { expiresAt: createdSession.expiresAt }
  });

  return NextResponse.json({ ok: true, sessionToken: createdSession.sessionToken, qrCodeValue });
}
