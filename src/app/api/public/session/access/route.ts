import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { computeSessionStatus, createSessionAccessGrant, markSessionExpired, PUBLIC_ACCESS_COOKIE, verifyAttendanceCode } from "@/lib/server/public-session";
import { clientIpHint, consumeRateLimits, payloadTooLargeResponse, rateLimitedResponse, readLimitedJson, stableHash } from "@/lib/server/public-api-security";

const schema = z.object({ publicToken: z.string().regex(/^[a-zA-Z0-9_-]{24,128}$/), accessCode: z.string().regex(/^\d{6}$/) });

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown; try { body = await readLimitedJson(request, 1024); } catch { return payloadTooLargeResponse(); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Informe o código de 6 dígitos do atendimento." }, { status: 400 });
  const db = getAdminFirestore() as any;
  const tables = await db.collection("tables").where("publicToken", "==", parsed.data.publicToken).limit(1).get();
  if (tables.empty) return NextResponse.json({ error: "Mesa não encontrada." }, { status: 404 });
  const tableDoc = tables.docs[0];
  const table = { id: tableDoc.id, ...tableDoc.data() } as any;
  if (table.isActive === false || table.status !== "active") return NextResponse.json({ error: "Mesa indisponível. Solicite a liberação a um funcionário." }, { status: 403 });
  const ip = stableHash(clientIpHint(request));
  const rate = await consumeRateLimits([{ scope: "access_table", key: table.id, limit: 40, windowSeconds: 300 }, { scope: "access_table_ip", key: `${table.id}:${ip}`, limit: 6, windowSeconds: 300 }]);
  if (!rate.ok) return rateLimitedResponse(rate.retryAfter);
  const sessions = await db.collection("tableSessions").where("tableId", "==", table.id).where("status", "==", "active").limit(1).get();
  if (sessions.empty) return NextResponse.json({ error: "Atendimento não está aberto." }, { status: 409 });
  const doc = sessions.docs[0];
  const session = { id: doc.id, ...doc.data() } as any;
  if (session.restaurantId !== table.restaurantId || computeSessionStatus(session) !== "active") {
    if (computeSessionStatus(session) === "expired") await markSessionExpired(session.id);
    return NextResponse.json({ error: "Atendimento indisponível." }, { status: 403 });
  }
  const verified = await verifyAttendanceCode(session, parsed.data.accessCode);
  if (!verified.ok) return NextResponse.json({ error: verified.limited ? "Muitas tentativas. Aguarde ou solicite um novo código à equipe." : "Código inválido." }, { status: verified.limited ? 429 : 401 });
  const grant = await createSessionAccessGrant(session);
  const response = NextResponse.json({ ok: true, csrfToken: grant.csrfToken, expiresAt: grant.expiresAt });
  response.cookies.set(PUBLIC_ACCESS_COOKIE, grant.cookieValue, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", expires: new Date(grant.expiresAt) });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
