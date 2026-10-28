import assert from "node:assert/strict";
import test from "node:test";

import { POST as purge } from "@/app/api/admin/operations/purge-orders/route";
import { POST as closeTable } from "@/app/api/admin/table/close/route";
import { POST as openTable } from "@/app/api/admin/table/open/route";
import { POST as access } from "@/app/api/public/session/access/route";
import { POST as createOrder } from "@/app/api/public/order/route";
import { GET as myOrders } from "@/app/api/public/orders/route";

import { fakeDb, publishedIndexes } from "../fakes/firebase-admin";
import { ADMIN_UID, Browser, json, KITCHEN_UID, RESTAURANT_ID, seedRestaurant, staffRequest } from "./helpers";

let seq = 0;
async function visit(publicToken: string, close: boolean) {
  const opened = await json(await openTable(staffRequest("/api/admin/table/open", ADMIN_UID, { tableId: "table-1" })));
  const phone = new Browser();
  const granted = await access(phone.request("/api/public/session/access", { method: "POST", body: { publicToken, accessCode: opened.attendanceCode } }));
  phone.absorb(granted);
  phone.csrf = (await json(granted)).csrfToken;
  await createOrder(phone.request("/api/public/order", { method: "POST", headers: { "x-csrf-token": phone.csrf, "idempotency-key": `purge-${++seq}-${Date.now()}` }, body: { items: [{ menuItemId: "drink-1", quantity: 1 }], paymentMethod: "pix", paymentMode: "counter" } }));
  if (close) await closeTable(staffRequest("/api/admin/table/close", ADMIN_UID, { tableId: "table-1", paidWith: "cash" }));
  return phone;
}

test("apagar pedidos concluídos: só administrador e só com APAGAR digitado", async () => {
  const { publicToken } = seedRestaurant();
  await visit(publicToken, true);
  assert.equal((await purge(staffRequest("/api/admin/operations/purge-orders", KITCHEN_UID, { until: null, confirm: "APAGAR" }))).status, 403);
  await fakeDb.collection("staffUsers").doc("manager-uid-789").set({ uid: "manager-uid-789", email: "gerente@teste.com", name: "Gerente", role: "manager", restaurantId: RESTAURANT_ID, isActive: true });
  assert.equal((await purge(staffRequest("/api/admin/operations/purge-orders", "manager-uid-789", { until: null, confirm: "APAGAR" }))).status, 403, "gerente não apaga dados");
  const unconfirmed = await purge(staffRequest("/api/admin/operations/purge-orders", ADMIN_UID, { until: null, confirm: "apaga" }));
  assert.equal(unconfirmed.status, 400);
  assert.equal(fakeDb.all("orders").length, 1, "nada foi apagado");
});

test("apaga mesas fechadas com pedidos, recibos e histórico; mesa aberta e cardápio ficam", async () => {
  const { publicToken } = seedRestaurant();
  const oldPhone = await visit(publicToken, true);
  await visit(publicToken, false);
  const menuBefore = fakeDb.all("menuItems").length;
  assert.equal(fakeDb.all("receipts").length, 1);

  const result = await json(await purge(staffRequest("/api/admin/operations/purge-orders", ADMIN_UID, { until: null, confirm: "apagar", resetReceiptNumbers: true })));
  assert.equal(result.ok, true);
  assert.equal(result.tables, 1);
  assert.equal(result.orders, 1);
  assert.equal(result.receiptsRestarted, true);

  const open = fakeDb.all("tableSessions");
  assert.equal(open.length, 1);
  assert.notEqual(open[0].status, "closed");
  assert.equal(fakeDb.all("orders").length, 1, "o pedido da mesa aberta continua");
  assert.equal(fakeDb.all("orders")[0].sessionId, open[0].id);
  assert.equal(fakeDb.all("receipts").length, 0);
  assert.equal(fakeDb.all("orderEvents").every((event) => event.sessionId === open[0].id), true);
  assert.equal(fakeDb.all("menuItems").length, menuBefore);
  assert.equal(fakeDb.all("restaurants").find((item) => item.id === RESTAURANT_ID).receiptSeq, 0);
  const audit = fakeDb.all("auditLog").find((entry) => entry.type === "orders_purged");
  assert.ok(audit, "a limpeza fica registrada");
  assert.equal(audit.metadata.orders, 1);

  // A phone from a deleted visit gets a clean answer, not a server error.
  const stale = await myOrders(oldPhone.request("/api/public/orders"));
  assert.ok(stale.status < 500, `status ${stale.status}`);
});

test("período: mesas fechadas depois da data escolhida ficam", async () => {
  const { publicToken } = seedRestaurant();
  await visit(publicToken, true);
  const result = await json(await purge(staffRequest("/api/admin/operations/purge-orders", ADMIN_UID, { until: "2020-01-01", confirm: "APAGAR" })));
  assert.equal(result.tables, 0);
  assert.equal(fakeDb.all("orders").length, 1);
  assert.equal(fakeDb.all("auditLog").some((entry) => entry.type === "orders_purged"), false, "nada apagado, nada registrado");
});

test("com o índice publicado, apaga até a data pela consulta indexada", async () => {
  const { publicToken } = seedRestaurant();
  publishedIndexes.add("tableSessions:restaurantId,status|closedAt");
  await visit(publicToken, true);
  await visit(publicToken, true);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const result = await json(await purge(staffRequest("/api/admin/operations/purge-orders", ADMIN_UID, { until: tomorrow, confirm: "APAGAR" })));
  assert.equal(result.tables, 2);
  assert.equal(result.more, false);
  assert.equal(fakeDb.all("tableSessions").length, 0);
  assert.equal(fakeDb.all("orders").length, 0);
});
