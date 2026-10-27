import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { withApiErrors } from "@/lib/server/api-errors";
import { MAX_PUBLIC_BODY_BYTES, payloadTooLargeResponse, readLimitedJson, stableHash } from "@/lib/server/public-api-security";
import { computeSessionStatus, PUBLIC_ACCESS_COOKIE, resolveAuthorizedSession, resolveTable } from "@/lib/server/public-session";
import { CartError, cartTotal, readCartItems, writeCartOrders } from "@/lib/server/place-order";

const MAX_CART_LINES = 30;
const itemSchema = z.object({ menuItemId: z.string().trim().min(1).max(128), quantity: z.number().int().min(1).max(20), notes: z.string().trim().max(180).nullable().optional() }).strict();
const payloadSchema = z.object({
  items: z.array(itemSchema).min(1).max(MAX_CART_LINES),
  customerName: z.string().trim().max(80).nullable().optional(), notes: z.string().trim().max(500).nullable().optional(),
  paymentMethod: z.enum(["pix", "cash", "debit_card", "credit_card"]), paymentMode: z.enum(["system_simulated", "counter", "waiter"]),
  changeFor: z.number().finite().positive().max(100000).transform((value) => Math.round(value * 100) / 100).nullable().optional()
}).strict();


async function handler(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try { body = await readLimitedJson(request, MAX_PUBLIC_BODY_BYTES); } catch { return payloadTooLargeResponse(); }
  const parsed = payloadSchema.safeParse(body);
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!parsed.success || !/^[a-zA-Z0-9_-]{16,128}$/.test(idempotencyKey)) return NextResponse.json({ error: "Pedido inválido. Confira o carrinho e tente novamente.", code: "invalid_payload" }, { status: 400 });

  const cookie = request.cookies.get(PUBLIC_ACCESS_COOKIE)?.value ?? null;
  const grantId = cookie?.split(".")[0] ?? "";
  const session = await resolveAuthorizedSession(cookie, request.headers.get("x-csrf-token"));
  if (!session) return NextResponse.json({ error: "Este celular precisa do código da mesa para fazer pedidos.", code: "needs_code" }, { status: 401 });
  const table = await resolveTable(session.tableId);
  if (!table || table.restaurantId !== session.restaurantId || table.status !== "active") return NextResponse.json({ error: "Esta mesa não está aberta para pedidos.", code: "no_session" }, { status: 409 });
  if (computeSessionStatus(session) !== "active") return NextResponse.json({ error: "O tempo deste atendimento acabou. Peça à equipe para renová-lo.", code: "session_expired" }, { status: 409 });

  const db = getAdminFirestore() as any;
  const canonical = JSON.stringify(parsed.data);
  const contentHash = stableHash(canonical);
  const idempotencyRef = db.collection("orderIdempotency").doc(stableHash(`${session.id}:${idempotencyKey}`));
  const settings = await db.collection("restaurantSettings").where("restaurantId", "==", session.restaurantId).limit(1).get();
  const configuration = settings.empty ? {} : settings.docs[0].data();
  const serviceFeePercent = Number(configuration.serviceFeePercent ?? 0);
  if (!Number.isFinite(serviceFeePercent) || serviceFeePercent < 0 || serviceFeePercent > 100) return NextResponse.json({ error: "Configuração de taxa inválida." }, { status: 503 });
  if (Array.isArray(configuration.acceptedPaymentMethods) && configuration.acceptedPaymentMethods.length > 0 && !configuration.acceptedPaymentMethods.includes(parsed.data.paymentMethod)) return NextResponse.json({ error: "Forma de pagamento não aceita pelo restaurante." }, { status: 400 });
  if (configuration.requireCustomerName === true && !parsed.data.customerName?.trim()) return NextResponse.json({ error: "Informe o nome do cliente para continuar." }, { status: 400 });
  if (configuration.allowCustomerNotes === false && (parsed.data.notes || parsed.data.items.some((item) => item.notes))) return NextResponse.json({ error: "Observações estão desativadas neste restaurante." }, { status: 400 });
  if (parsed.data.paymentMethod !== "cash" && parsed.data.changeFor != null) return NextResponse.json({ error: "Troco só pode ser solicitado para pagamento em dinheiro." }, { status: 400 });
  const antiSpamWindowSeconds = Math.min(3600, Math.max(1, Number(configuration.antiSpamWindowSeconds ?? 60)));
  const maxOrdersPerWindow = Math.min(20, Math.max(1, Number(configuration.maxOrdersPerWindow ?? 4)));

  try {
    const result = await db.runTransaction(async (tx: any) => {
      const nowMs = Date.now(); const now = new Date(nowMs).toISOString();
      const sessionRef = db.collection("tableSessions").doc(session.id);
      const rateRules = [
        { scope: "order_grant", key: grantId, limit: maxOrdersPerWindow, seconds: antiSpamWindowSeconds },
        { scope: "order_session", key: session.id, limit: maxOrdersPerWindow * 3, seconds: antiSpamWindowSeconds },
        { scope: "order_table", key: session.tableId, limit: maxOrdersPerWindow * 6, seconds: antiSpamWindowSeconds }
      ].map((rule) => ({ ...rule, window: Math.floor(nowMs / (rule.seconds * 1000)) }));
      const rateRefs = rateRules.map((rule) => db.collection("publicRateLimits").doc(stableHash(`${rule.scope}:${rule.key}:${rule.window}`)));
      const tableRef = db.collection("tables").doc(session.tableId);
      const [idemSnap, sessionSnap, tableSnap, ...rateSnaps] = await Promise.all([tx.get(idempotencyRef), tx.get(sessionRef), tx.get(tableRef), ...rateRefs.map((ref) => tx.get(ref))]);
      if (idemSnap.exists) {
        const idem = idemSnap.data();
        if (idem.contentHash !== contentHash) throw new Error("IDEMPOTENCY_CONFLICT");
        return { orderId: idem.orderId, orderCode: idem.orderCode, groupCode: idem.groupCode ?? null, orders: idem.orders ?? [{ orderId: idem.orderId, orderCode: idem.orderCode, station: "kitchen" }], subtotal: idem.subtotal, serviceFee: idem.serviceFee, total: idem.total, replay: true };
      }
      const fresh = sessionSnap.data();
      if (!sessionSnap.exists || fresh.status !== "active" || new Date(fresh.expiresAt).getTime() <= nowMs) throw new Error("SESSION_INACTIVE");
      const freshTable = tableSnap.data();
      if (!tableSnap.exists || freshTable.restaurantId !== session.restaurantId || freshTable.status !== "active" || freshTable.currentSessionGroupId !== session.id) throw new Error("SESSION_INACTIVE");
      if (fresh.orderLimitEnabled === true && Number(fresh.maxOrdersAllowed ?? 0) > 0 && (fresh.completedOrdersCount ?? 0) >= Number(fresh.maxOrdersAllowed)) throw new Error("ORDER_LIMIT");
      rateRules.forEach((rule, index) => { if ((rateSnaps[index].data()?.count ?? 0) >= rule.limit) { const error = new Error("RATE_LIMIT") as Error & { retryAfter?: number }; error.retryAfter = rule.seconds - Math.floor((nowMs / 1000) % rule.seconds); throw error; } });
      const items = await readCartItems(tx, db, session.restaurantId, parsed.data.items);
      if (parsed.data.changeFor != null && parsed.data.changeFor < cartTotal(items, serviceFeePercent)) throw new Error("INVALID_CHANGE");

      const summary = writeCartOrders(tx, db, {
        restaurantId: session.restaurantId,
        session: { id: session.id, tableId: session.tableId, tableNumber: fresh.tableNumber ?? session.tableNumber, sessionToken: session.sessionToken, customerName: session.customerName ?? null, completedOrdersCount: fresh.completedOrdersCount ?? 0 },
        items, serviceFeePercent,
        customerName: parsed.data.customerName || null, notes: parsed.data.notes || null,
        paymentMethod: parsed.data.paymentMethod, paymentMode: parsed.data.paymentMode, changeFor: parsed.data.changeFor ?? null,
        contentHash, actor: { type: "customer", id: grantId || null }, nowMs
      });
      tx.set(idempotencyRef, { sessionId: session.id, grantId, contentHash, ...summary, createdAt: now, expiresAt: new Date(nowMs + 24 * 3600_000).toISOString() });
      rateRules.forEach((rule, index) => tx.set(rateRefs[index], { scope: rule.scope, count: (rateSnaps[index].data()?.count ?? 0) + 1, resetAt: new Date((rule.window + 1) * rule.seconds * 1000).toISOString(), updatedAt: now }, { merge: true }));
      return { ...summary, replay: false };
    });
    return NextResponse.json(result, { status: result.replay ? 200 : 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "IDEMPOTENCY_CONFLICT") return NextResponse.json({ error: "O carrinho mudou durante o envio. Confirme o pedido novamente.", code: "idempotency_conflict" }, { status: 409 });
    if (code === "ORDER_LIMIT") return NextResponse.json({ error: "Esta mesa atingiu o limite de pedidos definido pela equipe. Chame um atendente.", code: "order_limit" }, { status: 409 });
    if (code === "INVALID_CHANGE") return NextResponse.json({ error: "O valor para troco deve ser igual ou maior que o total do pedido." }, { status: 400 });
    if (error instanceof CartError || code === "ITEM_UNAVAILABLE" || code === "ITEM_INVALID") return NextResponse.json({ error: "Um dos produtos do carrinho acabou de ficar indisponível. Remova-o e tente novamente.", code: "item_unavailable" }, { status: 409 });
    if (code === "RATE_LIMIT") { const retryAfter = (error as Error & { retryAfter?: number }).retryAfter ?? 60; return NextResponse.json({ error: `Muitas tentativas desta autorização. Tente novamente em ${retryAfter} segundos.`, retryAfter }, { status: 429, headers: { "Retry-After": String(retryAfter) } }); }
    if (code === "SESSION_INACTIVE") return NextResponse.json({ error: "O atendimento desta mesa foi encerrado ou pausado. Chame um atendente.", code: "session_inactive" }, { status: 409 });
    throw error;
  }
}

export const POST = withApiErrors("public/order", handler, "Não foi possível enviar o pedido agora. Tente novamente ou chame um atendente.");
