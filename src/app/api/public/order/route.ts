import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { withApiErrors } from "@/lib/server/api-errors";
import { MAX_PUBLIC_BODY_BYTES, payloadTooLargeResponse, readLimitedJson, stableHash } from "@/lib/server/public-api-security";
import { computeSessionStatus, PUBLIC_ACCESS_COOKIE, resolveAuthorizedSession, resolveTable } from "@/lib/server/public-session";
import { toRestaurantDateKey } from "@/lib/utils/date-key";

const MAX_CART_LINES = 30;
const itemSchema = z.object({ menuItemId: z.string().trim().min(1).max(128), quantity: z.number().int().min(1).max(20), notes: z.string().trim().max(180).nullable().optional() }).strict();
const payloadSchema = z.object({
  items: z.array(itemSchema).min(1).max(MAX_CART_LINES),
  customerName: z.string().trim().max(80).nullable().optional(), notes: z.string().trim().max(500).nullable().optional(),
  paymentMethod: z.enum(["pix", "cash", "debit_card", "credit_card"]), paymentMode: z.enum(["system_simulated", "counter", "waiter"]),
  changeFor: z.number().finite().positive().max(100000).transform((value) => Math.round(value * 100) / 100).nullable().optional()
}).strict();

const money = (value: number): number => Math.round(value * 100) / 100;
const paymentStatus = (mode: string): string => mode === "system_simulated" ? "simulação acadêmica — sem recebimento confirmado" : mode === "counter" ? "pagamento pendente no caixa" : "pagamento pendente com garçom";

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
      const menuRefs = parsed.data.items.map((item) => db.collection("menuItems").doc(item.menuItemId));
      const rateRules = [
        { scope: "order_grant", key: grantId, limit: maxOrdersPerWindow, seconds: antiSpamWindowSeconds },
        { scope: "order_session", key: session.id, limit: maxOrdersPerWindow * 3, seconds: antiSpamWindowSeconds },
        { scope: "order_table", key: session.tableId, limit: maxOrdersPerWindow * 6, seconds: antiSpamWindowSeconds }
      ].map((rule) => ({ ...rule, window: Math.floor(nowMs / (rule.seconds * 1000)) }));
      const rateRefs = rateRules.map((rule) => db.collection("publicRateLimits").doc(stableHash(`${rule.scope}:${rule.key}:${rule.window}`)));
      const tableRef = db.collection("tables").doc(session.tableId);
      const [idemSnap, sessionSnap, tableSnap, ...rest] = await Promise.all([tx.get(idempotencyRef), tx.get(sessionRef), tx.get(tableRef), ...menuRefs.map((ref) => tx.get(ref)), ...rateRefs.map((ref) => tx.get(ref))]);
      if (idemSnap.exists) {
        const idem = idemSnap.data();
        if (idem.contentHash !== contentHash) throw new Error("IDEMPOTENCY_CONFLICT");
        return { orderId: idem.orderId, orderCode: idem.orderCode, subtotal: idem.subtotal, serviceFee: idem.serviceFee, total: idem.total, replay: true };
      }
      const fresh = sessionSnap.data();
      if (!sessionSnap.exists || fresh.status !== "active" || new Date(fresh.expiresAt).getTime() <= nowMs) throw new Error("SESSION_INACTIVE");
      const freshTable = tableSnap.data();
      if (!tableSnap.exists || freshTable.restaurantId !== session.restaurantId || freshTable.status !== "active" || freshTable.currentSessionGroupId !== session.id) throw new Error("SESSION_INACTIVE");
      if (fresh.orderLimitEnabled === true && Number(fresh.maxOrdersAllowed ?? 0) > 0 && (fresh.completedOrdersCount ?? 0) >= Number(fresh.maxOrdersAllowed)) throw new Error("ORDER_LIMIT");
      const menuSnaps = rest.slice(0, menuRefs.length); const rateSnaps = rest.slice(menuRefs.length);
      rateRules.forEach((rule, index) => { if ((rateSnaps[index].data()?.count ?? 0) >= rule.limit) { const error = new Error("RATE_LIMIT") as Error & { retryAfter?: number }; error.retryAfter = rule.seconds - Math.floor((nowMs / 1000) % rule.seconds); throw error; } });
      const categoryIds = [...new Set(menuSnaps.map((snap: any) => snap.data()?.categoryId).filter(Boolean))] as string[];
      const categorySnaps = await Promise.all(categoryIds.map((id) => tx.get(db.collection("menuCategories").doc(id))));
      const activeCategories = categorySnaps.filter((snap: any) => snap.exists && snap.data().isActive !== false && snap.data().restaurantId === session.restaurantId);
      const categoryNames = new Map(activeCategories.map((snap: any) => [snap.id, String(snap.data().name ?? "Sem categoria").slice(0, 80)]));
      const items = parsed.data.items.map((input, index) => {
        const snap = menuSnaps[index]; const product = snap.exists ? snap.data() : null;
        if (!product || product.restaurantId !== session.restaurantId || product.isActive === false || product.isAvailable === false || !categoryNames.has(product.categoryId)) throw new Error("ITEM_UNAVAILABLE");
        const price = Number(product.price); if (!Number.isFinite(price) || price < 0) throw new Error("ITEM_INVALID");
        return { menuItemId: snap.id, nameSnapshot: String(product.name ?? "").slice(0, 120), categoryIdSnapshot: product.categoryId ?? null, categoryNameSnapshot: categoryNames.get(product.categoryId) ?? "Sem categoria", priceSnapshot: money(price), quantity: input.quantity, notes: input.notes || null, total: money(price * input.quantity) };
      });
      const subtotal = money(items.reduce((sum, item) => sum + item.total, 0)); const serviceFee = money(subtotal * serviceFeePercent / 100); const total = money(subtotal + serviceFee);
      if (parsed.data.changeFor != null && parsed.data.changeFor < total) throw new Error("INVALID_CHANGE");
      const sequence = (fresh.completedOrdersCount ?? 0) + 1; const orderRef = db.collection("orders").doc();
      const orderCode = `M${fresh.tableNumber}-${String(sequence).padStart(2, "0")}-${orderRef.id.slice(-4).toUpperCase()}`;
      tx.set(orderRef, { restaurantId: session.restaurantId, orderCode, tableId: session.tableId, tableNumber: session.tableNumber, sessionId: session.id, sessionToken: session.sessionToken, customerName: parsed.data.customerName || session.customerName || null, items, subtotal, serviceFeePercent, serviceFee, total, paymentMethod: parsed.data.paymentMethod, paymentMode: parsed.data.paymentMode, paymentStatus: paymentStatus(parsed.data.paymentMode), financialReceiptConfirmed: false, simulation: parsed.data.paymentMode === "system_simulated", changeFor: parsed.data.changeFor ?? null, status: "received", notes: parsed.data.notes || null, duplicateGuardHash: contentHash, dateKey: toRestaurantDateKey(new Date(nowMs)), receivedAt: now, deliveredAt: null, cancelledAt: null, createdAt: now, updatedAt: now });
      tx.set(idempotencyRef, { sessionId: session.id, grantId, contentHash, orderId: orderRef.id, orderCode, subtotal, serviceFee, total, createdAt: now, expiresAt: new Date(nowMs + 24 * 3600_000).toISOString() });
      tx.update(sessionRef, { completedOrdersCount: sequence, lastActivityAt: now, updatedAt: now });
      const eventRef = db.collection("orderEvents").doc();
      tx.set(eventRef, { restaurantId: session.restaurantId, orderId: orderRef.id, tableId: session.tableId, sessionId: session.id, type: "order_created", actorType: "customer", actorId: grantId || null, message: "Pedido criado pelo cliente", metadata: { orderCode }, createdAt: now });
      const alertRef = db.collection("adminAlerts").doc();
      tx.set(alertRef, { restaurantId: session.restaurantId, orderId: orderRef.id, tableId: session.tableId, sessionId: session.id, type: "new_order", message: `Novo pedido ${orderCode}`, read: false, createdAt: now, updatedAt: now });
      rateRules.forEach((rule, index) => tx.set(rateRefs[index], { scope: rule.scope, count: (rateSnaps[index].data()?.count ?? 0) + 1, resetAt: new Date((rule.window + 1) * rule.seconds * 1000).toISOString(), updatedAt: now }, { merge: true }));
      return { orderId: orderRef.id, orderCode, subtotal, serviceFee, total, replay: false };
    });
    return NextResponse.json(result, { status: result.replay ? 200 : 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "IDEMPOTENCY_CONFLICT") return NextResponse.json({ error: "O carrinho mudou durante o envio. Confirme o pedido novamente.", code: "idempotency_conflict" }, { status: 409 });
    if (code === "ORDER_LIMIT") return NextResponse.json({ error: "Esta mesa atingiu o limite de pedidos definido pela equipe. Chame um atendente.", code: "order_limit" }, { status: 409 });
    if (code === "INVALID_CHANGE") return NextResponse.json({ error: "O valor para troco deve ser igual ou maior que o total do pedido." }, { status: 400 });
    if (code === "ITEM_UNAVAILABLE" || code === "ITEM_INVALID") return NextResponse.json({ error: "Um dos produtos do carrinho acabou de ficar indisponível. Remova-o e tente novamente.", code: "item_unavailable" }, { status: 409 });
    if (code === "RATE_LIMIT") { const retryAfter = (error as Error & { retryAfter?: number }).retryAfter ?? 60; return NextResponse.json({ error: `Muitas tentativas desta autorização. Tente novamente em ${retryAfter} segundos.`, retryAfter }, { status: 429, headers: { "Retry-After": String(retryAfter) } }); }
    if (code === "SESSION_INACTIVE") return NextResponse.json({ error: "O atendimento desta mesa foi encerrado ou pausado. Chame um atendente.", code: "session_inactive" }, { status: 409 });
    throw error;
  }
}

export const POST = withApiErrors("public/order", handler, "Não foi possível enviar o pedido agora. Tente novamente ou chame um atendente.");
