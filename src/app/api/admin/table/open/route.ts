import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createOperationalEvent, createSessionForTable, resolveTable } from "@/lib/server/public-session";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";

const payloadSchema = z.object({
  tableId: z.string().min(1),
  label: z.string().min(1),
  number: z.number().int().positive(),
  capacity: z.number().int().positive(),
  currentPeopleCount: z.number().int().positive(),
  activeSessionLimit: z.number().int().positive().max(5),
  pinCode: z.string().length(4).nullable().optional()
});

export async function POST(request: NextRequest): Promise<NextResponse> {
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

  const allowedLimit = parsed.data.activeSessionLimit ?? table.activeSessionLimit ?? 1;
  if (activeSessionsSnapshot.size >= allowedLimit) {
    return NextResponse.json({ error: "Limite de sessões simultâneas atingido para esta mesa." }, { status: 409 });
  }

  const openedAt = new Date().toISOString();

  const createdSession = await createSessionForTable({ restaurantId: table.restaurantId, table });
  const qrCodeValue = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/m/${createdSession.sessionToken}`;

  await db.collection("tables").doc(table.id).set(
    {
      label: parsed.data.label,
      number: parsed.data.number,
      capacity: parsed.data.capacity,
      currentPeopleCount: parsed.data.currentPeopleCount,
      activeSessionLimit: parsed.data.activeSessionLimit,
      pinCode: parsed.data.pinCode ?? null,
      status: "active",
      openedAt,
      closedAt: null,
      activeSessionCount: activeSessionsSnapshot.size + 1,
      currentSessionGroupId: createdSession.sessionId,
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
