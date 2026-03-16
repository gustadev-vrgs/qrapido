import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { computeSessionStatus, createOperationalEvent, createSessionAccessGrant, markSessionExpired, resolveSession, resolveSettings, resolveTable } from "@/lib/server/public-session";

const payloadSchema = z.object({
  sessionToken: z.string().min(16).max(128),
  pinCode: z.string().length(4).optional()
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = payloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const session = await resolveSession(parsed.data.sessionToken);
  if (!session) {
    return NextResponse.json({ error: "Sessão não encontrada." }, { status: 404 });
  }

  const table = await resolveTable(session.tableId);
  if (!table) {
    return NextResponse.json({ error: "Mesa não encontrada." }, { status: 404 });
  }

  const status = computeSessionStatus(session);
  if (status === "expired") {
    await markSessionExpired(session.id);
    return NextResponse.json({ error: "Sessão expirada." }, { status: 410 });
  }

  if (status !== "active") {
    return NextResponse.json({ error: "Sessão indisponível." }, { status: 403 });
  }

  const settings = await resolveSettings(session.restaurantId);
  const requiresPin = Boolean(settings?.allowSessionPin && table.pinCode);

  if (requiresPin && parsed.data.pinCode !== table.pinCode) {
    await createOperationalEvent({
      restaurantId: session.restaurantId,
      tableId: table.id,
      sessionId: session.id,
      type: "session_closed",
      message: "Tentativa inválida de acesso por PIN incorreto",
      metadata: { reason: "invalid_pin" }
    });
    return NextResponse.json({ error: "PIN inválido." }, { status: 401 });
  }

  const access = await createSessionAccessGrant(session);

  return NextResponse.json({
    session: {
      id: session.id,
      restaurantId: session.restaurantId,
      tableId: session.tableId,
      tableNumber: session.tableNumber,
      customerName: session.customerName,
      status: session.status,
      expiresAt: session.expiresAt
    },
    requiresPin,
    accessToken: access.accessToken,
    accessTokenExpiresAt: access.expiresAt,
    tableStatus: table.status
  });
}
