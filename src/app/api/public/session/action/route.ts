import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { computeSessionStatus, createOperationalEvent, PUBLIC_ACCESS_COOKIE, resolveAuthorizedSession } from "@/lib/server/public-session";

const payloadSchema = z.object({
  action: z.enum(["waiter_called", "bill_requested"])
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = payloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const session = await resolveAuthorizedSession(request.cookies.get(PUBLIC_ACCESS_COOKIE)?.value ?? null, request.headers.get("x-csrf-token"));
  if (!session) {
    return NextResponse.json({ error: "Acesso não autorizado para essa sessão." }, { status: 401 });
  }

  if (computeSessionStatus(session) !== "active") {
    return NextResponse.json({ error: "Sessão indisponível." }, { status: 403 });
  }

  await createOperationalEvent({
    restaurantId: session.restaurantId,
    tableId: session.tableId,
    sessionId: session.id,
    type: parsed.data.action,
    message: parsed.data.action === "waiter_called" ? "Cliente chamou o garçom" : "Cliente solicitou a conta"
  });

  return NextResponse.json({ ok: true });
}
