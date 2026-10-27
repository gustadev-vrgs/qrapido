import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { withApiErrors } from "@/lib/server/api-errors";
import { toRestaurantDateKey } from "@/lib/utils/date-key";
import { computeSessionStatus, PUBLIC_ACCESS_COOKIE, resolveAuthorizedSession } from "@/lib/server/public-session";
import { consumeRateLimits, payloadTooLargeResponse, rateLimitedResponse, readLimitedJson, stableHash } from "@/lib/server/public-api-security";

const schema = z.object({ reason: z.enum(["fazer pagamento", "pedir ajuda", "solicitar talheres", "outra necessidade"]) });

async function handler(request: NextRequest): Promise<NextResponse> {
  let body: unknown; try { body = await readLimitedJson(request, 1024); } catch { return payloadTooLargeResponse(); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  const session = await resolveAuthorizedSession(request.cookies.get(PUBLIC_ACCESS_COOKIE)?.value ?? null, request.headers.get("x-csrf-token"));
  if (!session) return NextResponse.json({ error: "Este celular precisa do código da mesa para chamar o garçom.", code: "needs_code" }, { status: 401 });
  if (computeSessionStatus(session) !== "active") return NextResponse.json({ error: "O atendimento desta mesa não está ativo. Chame um atendente pessoalmente.", code: "session_inactive" }, { status: 409 });
  const db = getAdminFirestore() as any;
  const settings = await db.collection("restaurantSettings").where("restaurantId", "==", session.restaurantId).limit(1).get();
  const configuration = settings.empty ? null : settings.docs[0].data();
  const isBillRequest = parsed.data.reason === "fazer pagamento";
  if (configuration && (configuration.waiterCallEnabled === false || configuration.allowWaiterCall === false)) {
    return NextResponse.json({ error: "Chamados de garçom estão desativados neste restaurante." }, { status: 403 });
  }
  if (isBillRequest && configuration?.billRequestEnabled === false) {
    return NextResponse.json({ error: "Solicitação de conta está desativada neste restaurante." }, { status: 403 });
  }
  const grantId = request.cookies.get(PUBLIC_ACCESS_COOKIE)?.value?.split(".")[0] ?? "unknown";
  const rate = await consumeRateLimits([{ scope: "waiter_grant", key: grantId, limit: 3, windowSeconds: 300 }, { scope: "waiter_session", key: session.id, limit: 8, windowSeconds: 300 }]);
  if (!rate.ok) return rateLimitedResponse(rate.retryAfter);
  const now = new Date().toISOString();
  const ref = db.collection("waiterCalls").doc();
  const lockRef = db.collection("waiterCallLocks").doc(stableHash(`${session.id}:${parsed.data.reason}`));
  try {
    await db.runTransaction(async (tx: any) => {
      const lock = await tx.get(lockRef);
      if (lock.exists) throw new Error("DUPLICATE_CALL");
      tx.create(lockRef, { waiterCallId: ref.id, sessionId: session.id, reason: parsed.data.reason, createdAt: now });
      tx.create(ref, { restaurantId: session.restaurantId, tableId: session.tableId, tableNumber: session.tableNumber, sessionId: session.id, reason: parsed.data.reason, status: "pending", lockId: lockRef.id, dateKey: toRestaurantDateKey(), attendedAt: null, attendedBy: null, completedAt: null, completedBy: null, createdAt: now, updatedAt: now });
      tx.create(db.collection("orderEvents").doc(), { restaurantId: session.restaurantId, orderId: `waiter-call:${ref.id}`, tableId: session.tableId, sessionId: session.id, type: "waiter_called", actorType: "customer", actorId: grantId, message: `Chamado de garçom: ${parsed.data.reason}`, metadata: { waiterCallId: ref.id, reason: parsed.data.reason }, createdAt: now });
      tx.create(db.collection("adminAlerts").doc(), { restaurantId: session.restaurantId, type: "waiter_call", title: "Chamada de garçom", message: `Mesa ${session.tableNumber}: ${parsed.data.reason}.`, targetType: "waiterCall", targetId: ref.id, read: false, createdAt: now });
    });
    return NextResponse.json({ callId: ref.id }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "DUPLICATE_CALL") return NextResponse.json({ error: "A equipe já recebeu este chamado e está a caminho.", code: "duplicate_call" }, { status: 409 });
    throw error;
  }
}

export const POST = withApiErrors("public/waiter-call", handler, "Não foi possível chamar o garçom agora. Chame um atendente pessoalmente.");
