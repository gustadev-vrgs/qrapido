import assert from "node:assert/strict";
import test from "node:test";

import { POST as closeTable } from "@/app/api/admin/table/close/route";
import { POST as openTable } from "@/app/api/admin/table/open/route";
import { POST as transition } from "@/app/api/admin/order/transition/route";
import { GET as listCalls, POST as updateCall } from "@/app/api/admin/waiter-calls/route";
import { POST as access } from "@/app/api/public/session/access/route";
import { POST as createOrder } from "@/app/api/public/order/route";
import { POST as callWaiter } from "@/app/api/public/waiter-call/route";

import { fakeDb } from "../fakes/firebase-admin";
import { ADMIN_UID, Browser, json, seedRestaurant, staffRequest } from "./helpers";

let seq = 0;
async function seatedPhone() {
  const { publicToken } = seedRestaurant();
  const opened = await json(await openTable(staffRequest("/api/admin/table/open", ADMIN_UID, { tableId: "table-1", peopleCount: 2 })));
  const phone = new Browser();
  const granted = await access(phone.request("/api/public/session/access", { method: "POST", body: { publicToken, accessCode: opened.attendanceCode } }));
  phone.absorb(granted);
  phone.csrf = (await json(granted)).csrfToken;
  return phone;
}
async function order(phone: Browser, items: Array<{ menuItemId: string; quantity: number }>) {
  const response = await createOrder(phone.request("/api/public/order", { method: "POST", headers: { "x-csrf-token": phone.csrf, "idempotency-key": `caixa-${++seq}-${Date.now()}` }, body: { items, paymentMethod: "pix", paymentMode: "counter" } }));
  return json(response);
}

test("fechar a conta registra como foi pago, o total e libera a mesa", async () => {
  const phone = await seatedPhone();
  await order(phone, [{ menuItemId: "item-1", quantity: 1 }, { menuItemId: "drink-1", quantity: 1 }]);
  const kitchen = fakeDb.all("orders").find((item) => item.station === "kitchen")!;
  assert.equal((await transition(staffRequest("/api/admin/order/transition", ADMIN_UID, { orderId: kitchen.id, nextStatus: "ready" }))).status, 200);
  const expectedTotal = Math.round(fakeDb.all("orders").reduce((sum, item) => sum + Number(item.total), 0) * 100) / 100;

  const closed = await closeTable(staffRequest("/api/admin/table/close", ADMIN_UID, { tableId: "table-1", paidWith: "cash" }));
  const body = await json(closed);
  assert.equal(closed.status, 200);
  assert.equal(body.billTotal, expectedTotal);
  assert.equal(body.paidWith, "cash");

  for (const item of fakeDb.all("orders")) {
    assert.equal(item.status, "delivered");
    assert.equal(item.paidWith, "cash");
    assert.equal(item.financialReceiptConfirmed, true);
    assert.match(String(item.paymentStatus), /pago no caixa/);
  }
  const session = fakeDb.all("tableSessions")[0];
  assert.equal(session.status, "closed");
  assert.equal(session.billTotal, expectedTotal);
  assert.match(String(session.closeReason), /Conta paga \(dinheiro\)/);
  assert.equal(fakeDb.all("tables")[0].status, "free");
});

test("fechar sem forma de pagamento continua funcionando e não marca nada como pago", async () => {
  const phone = await seatedPhone();
  await order(phone, [{ menuItemId: "drink-1", quantity: 1 }]);
  assert.equal((await closeTable(staffRequest("/api/admin/table/close", ADMIN_UID, { tableId: "table-1" }))).status, 200);
  const only = fakeDb.all("orders")[0];
  assert.equal(only.status, "delivered");
  assert.equal(only.paidWith, undefined);
});

test("forma de pagamento inválida é recusada sem alterar nada", async () => {
  await seatedPhone();
  const response = await closeTable(staffRequest("/api/admin/table/close", ADMIN_UID, { tableId: "table-1", paidWith: "cheque" }));
  assert.equal(response.status, 400);
  assert.equal(fakeDb.all("tableSessions")[0].status, "active");
});

test("garçom resolve um chamado com um toque (direto de pendente para concluído)", async () => {
  const phone = await seatedPhone();
  const called = await callWaiter(phone.request("/api/public/waiter-call", { method: "POST", headers: { "x-csrf-token": phone.csrf }, body: { reason: "pedir ajuda" } }));
  assert.equal(called.status, 201);
  const listed = await json(await listCalls(staffRequest("/api/admin/waiter-calls", ADMIN_UID, undefined, "GET")));
  assert.equal(listed.calls.length, 1);
  assert.equal((await updateCall(staffRequest("/api/admin/waiter-calls", ADMIN_UID, { callId: listed.calls[0].id, action: "complete" }))).status, 200);
  assert.equal((await json(await listCalls(staffRequest("/api/admin/waiter-calls", ADMIN_UID, undefined, "GET")))).calls.length, 0);
  assert.equal(fakeDb.all("waiterCallLocks").length, 0, "a trava do chamado é liberada para a mesa poder chamar de novo");
});

test("conta dividida: PIX + cartão precisa bater com o total", async () => {
  const phone = await seatedPhone();
  await order(phone, [{ menuItemId: "item-1", quantity: 1 }, { menuItemId: "drink-1", quantity: 1 }]);
  const kitchen = fakeDb.all("orders").find((item) => item.station === "kitchen")!;
  assert.equal((await transition(staffRequest("/api/admin/order/transition", ADMIN_UID, { orderId: kitchen.id, nextStatus: "ready" }))).status, 200);
  const total = Math.round(fakeDb.all("orders").reduce((sum, item) => sum + Number(item.total), 0) * 100) / 100;
  const pix = 20;
  const card = Math.round((total - pix) * 100) / 100;

  const short = await closeTable(staffRequest("/api/admin/table/close", ADMIN_UID, { tableId: "table-1", payments: [{ method: "pix", amount: pix }] }));
  assert.equal(short.status, 409, "faltando dinheiro não fecha");
  assert.match((await json(short)).error, /Faltam/);
  assert.equal(fakeDb.all("tableSessions")[0].status, "active", "nada mudou");

  const closed = await closeTable(staffRequest("/api/admin/table/close", ADMIN_UID, { tableId: "table-1", payments: [{ method: "pix", amount: pix }, { method: "credit_card", amount: card }] }));
  assert.equal(closed.status, 200);
  const session = fakeDb.all("tableSessions")[0];
  assert.equal(session.status, "closed");
  assert.deepEqual(session.payments, [{ method: "pix", amount: pix }, { method: "credit_card", amount: card }]);
  assert.equal(session.paidWith, card > pix ? "credit_card" : "pix", "a forma que recebeu mais fica como principal");
  assert.equal(typeof session.closedDateKey, "string");
  for (const item of fakeDb.all("orders")) assert.match(String(item.paymentStatus), /PIX R\$ 20,00 \+ cartão de crédito/);
});
