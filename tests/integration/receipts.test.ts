import assert from "node:assert/strict";
import test from "node:test";

import { POST as closeTable } from "@/app/api/admin/table/close/route";
import { POST as openTable } from "@/app/api/admin/table/open/route";
import { POST as access } from "@/app/api/public/session/access/route";
import { POST as createOrder } from "@/app/api/public/order/route";
import { GET as myOrders } from "@/app/api/public/orders/route";
import { POST as cancelOrder } from "@/app/api/admin/order/transition/route";
import { receiptLines, tokenMatches } from "@/lib/server/receipts";

import { fakeDb } from "../fakes/firebase-admin";
import { ADMIN_UID, Browser, json, RESTAURANT_ID, seedRestaurant, staffRequest } from "./helpers";

let seq = 0;
async function seatedAt(publicToken: string) {
  const opened = await json(await openTable(staffRequest("/api/admin/table/open", ADMIN_UID, { tableId: "table-1" })));
  const phone = new Browser();
  const granted = await access(phone.request("/api/public/session/access", { method: "POST", body: { publicToken, accessCode: opened.attendanceCode } }));
  phone.absorb(granted);
  phone.csrf = (await json(granted)).csrfToken;
  return phone;
}
const order = (phone: Browser, items: unknown[]) => createOrder(phone.request("/api/public/order", { method: "POST", headers: { "x-csrf-token": phone.csrf, "idempotency-key": `recibo-${++seq}-${Date.now()}` }, body: { items, paymentMethod: "pix", paymentMode: "counter" } }));

test("fechar a conta emite comprovante numerado com itens, taxa e pagamentos", async () => {
  const { publicToken } = seedRestaurant();
  await fakeDb.collection("restaurants").doc(RESTAURANT_ID).update({ address: "Rua das Flores, 10", legalName: "Cantina Teste LTDA", document: "12.345.678/0001-90" });
  const phone = await seatedAt(publicToken);
  await order(phone, [{ menuItemId: "item-1", quantity: 2 }, { menuItemId: "drink-1", quantity: 1 }]);
  await order(phone, [{ menuItemId: "item-1", quantity: 1 }]);
  const toCancel = fakeDb.all("orders").find((item) => item.station === "ready")!;
  await cancelOrder(staffRequest("/api/admin/order/transition", ADMIN_UID, { orderId: toCancel.id, nextStatus: "cancelled", reason: "Acabou o refrigerante" }));

  const billTotal = Math.round(fakeDb.all("orders").filter((item) => item.status !== "cancelled").reduce((sum, item) => sum + item.total, 0) * 100) / 100;
  const closedRaw = await closeTable(staffRequest("/api/admin/table/close", ADMIN_UID, { tableId: "table-1", force: true, payments: [{ method: "pix", amount: 50 }, { method: "cash", amount: Math.round((billTotal - 50) * 100) / 100 }] }));
  const closed = await json(closedRaw);
  assert.equal(closedRaw.status, 200, JSON.stringify(closed));
  assert.equal(closed.receipt.number, 1);
  assert.match(closed.receipt.url, /^\/recibo\/[^?]+\?t=[a-f0-9]{32}$/);

  const receipt = fakeDb.all("receipts")[0];
  assert.equal(receipt.number, 1);
  assert.deepEqual(receipt.lines.map((line: { name: string; quantity: number }) => [line.name, line.quantity]), [["X-Burger", 3]], "pedidos iguais viram uma linha; cancelado fica de fora");
  assert.equal(receipt.total, billTotal);
  assert.equal(receipt.payments.length, 2);
  assert.equal(receipt.issuer.document, "12.345.678/0001-90");
  assert.equal(receipt.courtesy, false);
  const session = fakeDb.all("tableSessions")[0];
  assert.equal(session.receiptNumber, 1);
  assert.equal(session.receiptUrl, closed.receipt.url);

  // The table's phone sees the receipt after the bill is closed.
  const listed = await json(await myOrders(phone.request("/api/public/orders")));
  assert.equal(listed.receiptUrl, closed.receipt.url);
});

test("numeração segue entre mesas; mesa sem consumo não gera recibo; cortesia fica indicada", async () => {
  const { publicToken } = seedRestaurant();
  const first = await seatedAt(publicToken);
  await order(first, [{ menuItemId: "drink-1", quantity: 1 }]);
  assert.equal((await json(await closeTable(staffRequest("/api/admin/table/close", ADMIN_UID, { tableId: "table-1", paidWith: "cash" })))).receipt.number, 1);

  await seatedAt(publicToken);
  assert.equal((await json(await closeTable(staffRequest("/api/admin/table/close", ADMIN_UID, { tableId: "table-1" })))).receipt, null, "abriu e fechou sem pedir: sem recibo");

  const third = await seatedAt(publicToken);
  await order(third, [{ menuItemId: "drink-1", quantity: 2 }]);
  const courtesy = await json(await closeTable(staffRequest("/api/admin/table/close", ADMIN_UID, { tableId: "table-1" })));
  assert.equal(courtesy.receipt.number, 2);
  assert.equal(fakeDb.all("receipts").find((item) => item.number === 2).courtesy, true);
  assert.equal(fakeDb.all("restaurants").find((item) => item.id === RESTAURANT_ID).receiptSeq, 2);
});

test("link do recibo só abre com o token certo", () => {
  const token = "a".repeat(32);
  assert.equal(tokenMatches(token, token), true);
  assert.equal(tokenMatches(token, "b".repeat(32)), false);
  assert.equal(tokenMatches(token, undefined), false);
  assert.equal(tokenMatches(token, "a".repeat(31)), false);
  assert.equal(tokenMatches(token, `${"a".repeat(31)}"`), false);
  assert.equal(receiptLines([]).total, 0);
});
