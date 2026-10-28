import assert from "node:assert/strict";
import test from "node:test";

import { POST as closeTable } from "@/app/api/admin/table/close/route";
import { POST as newCode } from "@/app/api/admin/table/code/route";
import { POST as openTable } from "@/app/api/admin/table/open/route";
import { POST as sessionAction } from "@/app/api/admin/table/session/route";
import { POST as transition } from "@/app/api/admin/order/transition/route";
import { GET as listCalls, POST as updateCall } from "@/app/api/admin/waiter-calls/route";
import { GET as diagnose } from "@/app/api/admin/operations/diagnose/route";
import { POST as repair } from "@/app/api/admin/operations/repair/route";
import { GET as health } from "@/app/api/health/route";
import { GET as getTable } from "@/app/api/public/table/[token]/route";
import { POST as access } from "@/app/api/public/session/access/route";
import { POST as createOrder } from "@/app/api/public/order/route";
import { GET as getOrder } from "@/app/api/public/order/[orderId]/route";
import { GET as myOrders } from "@/app/api/public/orders/route";
import { POST as callWaiter } from "@/app/api/public/waiter-call/route";

import { FakeIndexError, fakeDb } from "../fakes/firebase-admin";
import { ADMIN_UID, Browser, KITCHEN_UID, json, ORIGIN, seedRestaurant, staffRequest } from "./helpers";

// No composite index is "published" in these tests: everything on the customer
// path and in the operational panel must work on a brand-new Firebase project.

async function scan(phone: Browser, token: string) {
  const response = await getTable(phone.request(`/api/public/table/${token}`), { params: Promise.resolve({ token }) });
  return { status: response.status, body: await json(response) };
}

async function openWithCode(body: Record<string, unknown> = {}) {
  const response = await openTable(staffRequest("/api/admin/table/open", ADMIN_UID, { tableId: "table-1", peopleCount: 2, ...body }));
  const payload = await json(response);
  assert.equal(response.status, 201, JSON.stringify(payload));
  return payload as { attendanceCode: string; sessionId: string; qrCodeValue: string };
}

async function enterCode(phone: Browser, publicToken: string, accessCode: string) {
  const response = await access(phone.request("/api/public/session/access", { method: "POST", body: { publicToken, accessCode } }));
  const body = await json(response);
  if (response.ok) { phone.absorb(response); phone.csrf = body.csrfToken; }
  return { status: response.status, body };
}

let orderSeq = 0;
async function order(phone: Browser, items = [{ menuItemId: "item-1", quantity: 1 }], extra: Record<string, unknown> = {}) {
  const response = await createOrder(phone.request("/api/public/order", { method: "POST", headers: { "x-csrf-token": phone.csrf, "idempotency-key": `pedido-de-teste-${++orderSeq}-${Date.now()}` }, body: { items, paymentMethod: "cash", paymentMode: "counter", ...extra } }));
  return { status: response.status, body: await json(response) };
}

test("QR de mesa ainda não aberta mostra o cardápio e pede para chamar a equipe", async () => {
  const { publicToken } = seedRestaurant();
  const { status, body } = await scan(new Browser(), publicToken);
  assert.equal(status, 200);
  assert.equal(body.access, "no_session");
  assert.equal(body.restaurantName, "Cantina Teste");
  assert.deepEqual(body.items.map((item: { id: string }) => item.id), ["item-1", "item-2", "drink-1"], "itens de categoria desativada não aparecem");
  assert.equal(body.session, null);
});

test("fluxo completo: abrir mesa, código, vários pedidos, cozinha, encerrar", async () => {
  const { publicToken } = seedRestaurant();
  const opened = await openWithCode();
  assert.match(opened.attendanceCode, /^\d{6}$/);
  assert.equal(opened.qrCodeValue, `${ORIGIN}/mesa/${publicToken}`);
  assert.equal(fakeDb.all("tableSessions")[0].staffAccessCode, opened.attendanceCode, "a equipe consegue ver o código depois");

  const phone = new Browser();
  assert.equal((await scan(phone, publicToken)).body.access, "needs_code");
  assert.equal((await enterCode(phone, publicToken, "000000".replace(/./g, (d, i) => String((Number(opened.attendanceCode[i]) + 1) % 10)))).status, 401);
  assert.equal((await enterCode(phone, publicToken, opened.attendanceCode)).status, 200);
  const menu = await scan(phone, publicToken);
  assert.equal(menu.body.access, "authorized");
  assert.equal(menu.body.session.orderLimitEnabled, false);

  const first = await order(phone);
  const second = await order(phone, [{ menuItemId: "item-2", quantity: 2 }]);
  const third = await order(phone);
  assert.deepEqual([first.status, second.status, third.status], [201, 201, 201], "sem limite definido, a mesa pode pedir quantas vezes quiser");
  assert.equal(second.body.total, 16);
  assert.match(fakeDb.all("orders")[0].dateKey as string, /^\d{4}-\d{2}-\d{2}$/);

  // A second phone at the same table, using the same code.
  const friend = new Browser();
  assert.equal((await enterCode(friend, publicToken, opened.attendanceCode)).status, 200);
  assert.equal((await order(friend)).status, 201);

  // Kitchen moves orders, the floor delivers; customer sees it.
  for (const next of ["in_preparation", "ready", "delivered"]) {
    const response = await transition(staffRequest("/api/admin/order/transition", next === "delivered" ? ADMIN_UID : KITCHEN_UID, { orderId: first.body.orderId, nextStatus: next }));
    assert.equal(response.status, 200, next);
  }
  const tracked = await json(await getOrder(phone.request(`/api/public/order/${first.body.orderId}`), { params: Promise.resolve({ orderId: first.body.orderId }) }));
  assert.equal(tracked.status, "delivered");
  assert.equal(tracked.orderCode, first.body.orderCode);

  const blocked = await closeTable(staffRequest("/api/admin/table/close", ADMIN_UID, { tableId: "table-1" }));
  assert.equal(blocked.status, 409);
  const blockedBody = await json(blocked);
  assert.equal(blockedBody.code, "kitchen_pending");
  assert.match(blockedBody.error, /Ainda na cozinha/);

  for (const pendingOrder of [second, third]) {
    await transition(staffRequest("/api/admin/order/transition", ADMIN_UID, { orderId: pendingOrder.body.orderId, nextStatus: "cancelled", reason: "Cliente desistiu" }));
  }
  const friendOrder = fakeDb.all("orders").find((item) => item.status === "received")!;
  await transition(staffRequest("/api/admin/order/transition", ADMIN_UID, { orderId: friendOrder.id, nextStatus: "cancelled", reason: "Teste de cancelamento" }));
  const cancelled = await json(await getOrder(phone.request(`/api/public/order/${second.body.orderId}`), { params: Promise.resolve({ orderId: second.body.orderId }) }));
  assert.equal(cancelled.cancellationReason, "Cliente desistiu");

  const closed = await closeTable(staffRequest("/api/admin/table/close", ADMIN_UID, { tableId: "table-1" }));
  assert.equal(closed.status, 200);
  assert.equal((await scan(phone, publicToken)).body.access, "no_session");
  assert.equal((await order(phone)).status, 401, "depois de encerrar, o celular não pede mais");
  const history = await json(await myOrders(phone.request("/api/public/orders")));
  assert.equal(history.orders.length, 4, "o histórico da mesa continua visível para quem pediu");
});

test("limite de pedidos só vale quando a equipe define", async () => {
  const { publicToken } = seedRestaurant();
  const opened = await openWithCode({ orderLimit: 1 });
  const phone = new Browser();
  await enterCode(phone, publicToken, opened.attendanceCode);
  assert.equal((await order(phone)).status, 201);
  const refused = await order(phone);
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, "order_limit");

  const renewed = await sessionAction(staffRequest("/api/admin/table/session", ADMIN_UID, { tableId: "table-1", action: "renew", orderLimit: null }));
  assert.equal(renewed.status, 200);
  assert.equal((await order(phone)).status, 201, "renovar sem limite libera novos pedidos");
});

test("novo código: celulares já liberados continuam, o código antigo deixa de valer", async () => {
  const { publicToken } = seedRestaurant();
  const opened = await openWithCode();
  const phone = new Browser();
  await enterCode(phone, publicToken, opened.attendanceCode);
  const renewed = await json(await newCode(staffRequest("/api/admin/table/code", ADMIN_UID, { tableId: "table-1" })));
  assert.match(renewed.attendanceCode, /^\d{6}$/);
  assert.equal((await order(phone)).status, 201);
  if (renewed.attendanceCode !== opened.attendanceCode) assert.equal((await enterCode(new Browser(), publicToken, opened.attendanceCode)).status, 401);
  assert.equal((await enterCode(new Browser(), publicToken, renewed.attendanceCode)).status, 200);
});

test("atendimento expirado não trava a mesa: pode renovar ou reabrir", async () => {
  const { publicToken } = seedRestaurant();
  const opened = await openWithCode();
  const phone = new Browser();
  await enterCode(phone, publicToken, opened.attendanceCode);
  await fakeDb.collection("tableSessions").doc(opened.sessionId).update({ expiresAt: new Date(Date.now() - 1000).toISOString() });

  assert.equal((await scan(phone, publicToken)).body.access, "expired");
  assert.equal(fakeDb.all("tables")[0].status, "active", "a mesa não vai mais para 'bloqueada'");
  assert.equal((await order(phone)).status, 401);

  const reopened = await openTable(staffRequest("/api/admin/table/open", ADMIN_UID, { tableId: "table-1", peopleCount: 3 }));
  assert.equal(reopened.status, 201, "reabrir funciona sem precisar encerrar antes");
  const fresh = await json(reopened);
  assert.equal((await enterCode(phone, publicToken, fresh.attendanceCode)).status, 200);
  assert.equal((await order(phone)).status, 201);
});

test("mesas travadas por versões antigas podem ser encerradas", async () => {
  seedRestaurant();
  await fakeDb.collection("tables").doc("table-1").update({ status: "active", currentSessionGroupId: null });
  const response = await closeTable(staffRequest("/api/admin/table/close", ADMIN_UID, { tableId: "table-1" }));
  assert.equal(response.status, 200);
  assert.equal((await json(response)).recovered, true);
  assert.equal(fakeDb.all("tables")[0].status, "free");

  await fakeDb.collection("tables").doc("table-1").update({ status: "blocked", currentSessionGroupId: "sessao-que-nao-existe" });
  assert.equal((await closeTable(staffRequest("/api/admin/table/close", ADMIN_UID, { tableId: "table-1" }))).status, 200);
  assert.equal((await openTable(staffRequest("/api/admin/table/open", ADMIN_UID, { tableId: "table-1", peopleCount: 1 }))).status, 201);
});

test("pedido com produto de categoria desativada é recusado", async () => {
  const { publicToken } = seedRestaurant();
  const opened = await openWithCode();
  const phone = new Browser();
  await enterCode(phone, publicToken, opened.attendanceCode);
  const refused = await order(phone, [{ menuItemId: "item-off", quantity: 1 }]);
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, "item_unavailable");
});

test("chamado de garçom chega ao painel e pode ser atendido", async () => {
  const { publicToken } = seedRestaurant();
  const opened = await openWithCode();
  const phone = new Browser();
  await enterCode(phone, publicToken, opened.attendanceCode);
  const call = await callWaiter(phone.request("/api/public/waiter-call", { method: "POST", headers: { "x-csrf-token": phone.csrf }, body: { reason: "pedir ajuda" } }));
  assert.equal(call.status, 201);
  const listed = await json(await listCalls(staffRequest("/api/admin/waiter-calls", ADMIN_UID, undefined, "GET")));
  assert.equal(listed.calls.length, 1);
  assert.equal((await updateCall(staffRequest("/api/admin/waiter-calls", ADMIN_UID, { callId: listed.calls[0].id, action: "attend" }))).status, 200);
  assert.equal((await updateCall(staffRequest("/api/admin/waiter-calls", ADMIN_UID, { callId: listed.calls[0].id, action: "complete" }))).status, 200);
  assert.equal((await json(await listCalls(staffRequest("/api/admin/waiter-calls", ADMIN_UID, undefined, "GET")))).calls.length, 0);
});

test("falha do Firestore vira mensagem clara em JSON, não uma página 500", async () => {
  const { publicToken } = seedRestaurant();
  const original = fakeDb.collection.bind(fakeDb);
  fakeDb.collection = ((name: string) => { if (name === "menuItems") throw new FakeIndexError(name, "simulado"); return original(name); }) as typeof fakeDb.collection;
  try {
    const { status, body } = await scan(new Browser(), publicToken);
    assert.equal(status, 503);
    assert.equal(body.code, "firestore_index_missing");
    assert.ok(body.error && body.requestId);
  } finally {
    fakeDb.collection = original;
  }
});

test("diagnóstico encontra cadastro faltando e QR inválido; reparo corrige", async () => {
  seedRestaurant({ withRestaurantDoc: false });
  await fakeDb.collection("tables").doc("table-1").update({ publicToken: "legacy-token-placeholder" });
  const report = await json(await diagnose(staffRequest("/api/admin/operations/diagnose", ADMIN_UID, undefined, "GET")));
  const codes = report.issues.map((issue: { code: string }) => issue.code);
  assert.ok(codes.includes("RESTAURANT_DOC_MISSING"), codes.join());
  assert.ok(codes.includes("TABLE_QR_INVALID"), codes.join());
  assert.ok(codes.includes("SETTINGS_MISSING"), codes.join());
  assert.ok(report.issues.some((issue: { code: string; link?: string }) => issue.code === "INDEX_MISSING" && issue.link), "relatórios: link para criar índice");

  const fixed = await json(await repair(staffRequest("/api/admin/operations/repair", ADMIN_UID, {})));
  assert.equal(fixed.ok, true);
  const after = await json(await diagnose(staffRequest("/api/admin/operations/diagnose", ADMIN_UID, undefined, "GET")));
  const remaining = after.issues.map((issue: { code: string }) => issue.code);
  assert.ok(!remaining.includes("RESTAURANT_DOC_MISSING") && !remaining.includes("TABLE_QR_INVALID") && !remaining.includes("SETTINGS_MISSING"), remaining.join());
  const token = fakeDb.all("tables")[0].publicToken as string;
  assert.equal((await scan(new Browser(), token)).status, 200, "o QR novo abre a mesa");
});

test("health informa a configuração sem expor segredos", async () => {
  const body = await json(await health(new (await import("next/server")).NextRequest(`${ORIGIN}/api/health`)));
  assert.equal(body.firestore.ok, true);
  assert.equal(body.firebaseAdmin.ok, true);
  assert.ok(!JSON.stringify(body).includes("PRIVATE KEY"));
});

test("funcionário sem cadastro recebe motivo claro", async () => {
  seedRestaurant();
  const response = await openTable(staffRequest("/api/admin/table/open", "uid-sem-cadastro", { tableId: "table-1", peopleCount: 1 }));
  assert.equal(response.status, 403);
  assert.match((await json(response)).error, /staffUsers\/uid-sem-cadastro/);
});
