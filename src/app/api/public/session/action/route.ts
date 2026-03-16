import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { computeSessionStatus, createOperationalEvent, resolveSession, validateAccessGrant } from "@/lib/server/public-session";

const payloadSchema = z.object({
  sessionToken: z.string().min(16).max(128),
  action: z.enum(["waiter_called", "bill_requested"])
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

  const accessToken = request.headers.get("x-session-access-token");
  if (!(await validateAccessGrant(session, accessToken))) {
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
