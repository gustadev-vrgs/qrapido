import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { computeSessionStatus, PUBLIC_ACCESS_COOKIE, resolveAuthorizedSession } from "@/lib/server/public-session";
import { consumeRateLimits, payloadTooLargeResponse, rateLimitedResponse, readLimitedJson } from "@/lib/server/public-api-security";

const schema = z.object({ reason: z.enum(["fazer pagamento", "pedir ajuda", "solicitar talheres", "outra necessidade"]) });

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown; try { body = await readLimitedJson(request, 1024); } catch { return payloadTooLargeResponse(); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  const session = await resolveAuthorizedSession(request.cookies.get(PUBLIC_ACCESS_COOKIE)?.value ?? null, request.headers.get("x-csrf-token"));
  if (!session) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  if (computeSessionStatus(session) !== "active") return NextResponse.json({ error: "Sessão indisponível." }, { status: 403 });
  const grantId = request.cookies.get(PUBLIC_ACCESS_COOKIE)?.value?.split(".")[0] ?? "unknown";
  const rate = await consumeRateLimits([{ scope: "waiter_grant", key: grantId, limit: 3, windowSeconds: 300 }, { scope: "waiter_session", key: session.id, limit: 8, windowSeconds: 300 }]);
  if (!rate.ok) return rateLimitedResponse(rate.retryAfter);
  const db = getAdminFirestore() as any;
  const duplicate = await db.collection("waiterCalls").where("sessionId", "==", session.id).where("reason", "==", parsed.data.reason).where("status", "in", ["pendente", "em atendimento"]).limit(1).get();
  if (!duplicate.empty) return NextResponse.json({ error: "Já existe um chamado igual em aberto para esta mesa." }, { status: 409 });
  const now = new Date().toISOString();
  const ref = await db.collection("waiterCalls").add({ restaurantId: session.restaurantId, tableId: session.tableId, tableNumber: session.tableNumber, sessionId: session.id, reason: parsed.data.reason, status: "pendente", createdAt: now, updatedAt: now });
  await db.collection("adminAlerts").add({ restaurantId: session.restaurantId, type: "waiter_call", title: "Chamada de garçom", message: `Mesa ${session.tableNumber}: ${parsed.data.reason}.`, targetType: "waiterCall", targetId: ref.id, read: false, createdAt: now });
  return NextResponse.json({ callId: ref.id }, { status: 201 });
}
