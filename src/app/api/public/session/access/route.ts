import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withApiErrors } from "@/lib/server/api-errors";
import { clientIpHint, consumeRateLimits, payloadTooLargeResponse, rateLimitedResponse, readLimitedJson, stableHash } from "@/lib/server/public-api-security";
import { computeSessionStatus, createSessionAccessGrant, findLiveSessionForTable, markSessionExpired, PUBLIC_ACCESS_COOKIE, resolveTableByPublicToken, verifyAttendanceCode } from "@/lib/server/public-session";
import { PUBLIC_TABLE_TOKEN_PATTERN } from "@/lib/utils/public-url";

const schema = z.object({ publicToken: z.string().regex(PUBLIC_TABLE_TOKEN_PATTERN), accessCode: z.string().trim().regex(/^\d{6}$/) });

async function handler(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try { body = await readLimitedJson(request, 1024); } catch { return payloadTooLargeResponse(); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Informe o código de 6 dígitos que a equipe passou para a sua mesa.", code: "invalid_payload" }, { status: 400 });

  const table = await resolveTableByPublicToken(parsed.data.publicToken);
  if (!table) return NextResponse.json({ error: "Mesa não encontrada. Leia novamente o QR Code.", code: "invalid_qr" }, { status: 404 });
  if (table.isActive === false) return NextResponse.json({ error: "Esta mesa está indisponível. Chame um atendente.", code: "table_disabled" }, { status: 403 });

  const ip = stableHash(clientIpHint(request));
  const rate = await consumeRateLimits([
    { scope: "access_table", key: table.id, limit: 40, windowSeconds: 300 },
    { scope: "access_table_ip", key: `${table.id}:${ip}`, limit: 8, windowSeconds: 300 }
  ]);
  if (!rate.ok) return rateLimitedResponse(rate.retryAfter);

  const session = await findLiveSessionForTable(table);
  if (!session || table.status !== "active") return NextResponse.json({ error: "O atendimento desta mesa ainda não foi aberto. Peça a um atendente para abrir a mesa.", code: "no_session" }, { status: 409 });
  if (session.restaurantId !== table.restaurantId || computeSessionStatus(session) !== "active") {
    if (computeSessionStatus(session) === "expired") await markSessionExpired(session.id);
    return NextResponse.json({ error: "O tempo deste atendimento acabou. Peça à equipe para renová-lo.", code: "session_expired" }, { status: 409 });
  }

  const verified = await verifyAttendanceCode(session, parsed.data.accessCode);
  if (!verified.ok) return NextResponse.json({ error: "Código incorreto. Confira com a equipe o código desta mesa.", code: "wrong_code" }, { status: 401 });

  const grant = await createSessionAccessGrant(session);
  const response = NextResponse.json({ ok: true, csrfToken: grant.csrfToken, expiresAt: grant.expiresAt });
  response.cookies.set(PUBLIC_ACCESS_COOKIE, grant.cookieValue, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: new Date(grant.expiresAt) });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const POST = withApiErrors("public/session/access", handler, "Não foi possível validar o código agora. Tente novamente ou avise a equipe.");
