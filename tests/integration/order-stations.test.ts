import assert from "node:assert/strict";
import test from "node:test";

import { POST as archiveTable } from "@/app/api/admin/table/archive/route";
import { POST as closeTable } from "@/app/api/admin/table/close/route";
import { POST as openTable } from "@/app/api/admin/table/open/route";
import { POST as transition } from "@/app/api/admin/order/transition/route";
import { GET as getTable } from "@/app/api/public/table/[token]/route";
import { POST as access } from "@/app/api/public/session/access/route";
import { POST as createOrder } from "@/app/api/public/order/route";
import { GET as myOrders } from "@/app/api/public/orders/route";
import { POST as callWaiter } from "@/app/api/public/waiter-call/route";

import { fakeDb } from "../fakes/firebase-admin";
import { ADMIN_UID, Browser, json, KITCHEN_UID, seedRestaurant, staffRequest } from "./helpers";

let seq = 0;
async function seatedPhone() {
  const { publicToken } = seedRestaurant();
  const opened = await json(await openTable(staffRequest("/api/admin/table/open", ADMIN_UID, { tableId: "table-1", peopleCount: 2 })));
  const phone = new Browser();
  const granted = await access(phone.request("/api/public/session/access", { method: "POST", body: { publicToken, accessCode: opened.attendanceCode } }));
  phone.absorb(granted);
  phone.csrf = (await json(granted)).csrfToken;
  return { phone, publicToken };
}
async function order(phone: Browser, items: Array<{ menuItemId: string; quantity: number }>) {
  const response = await createOrder(phone.request("/api/public/order", { method: "POST", headers: { "x-csrf-token": phone.csrf, "idempotency-key": `etapa1-pedido-${++seq}-${Date.now()}` }, body: { items, paymentMethod: "cash", paymentMode: "counter" } }));
  return { status: response.status, body: await json(response) };
}

test("carrinho com prato e bebida vira dois pedidos: cozinha e pronta entrega", async () => {
  const { phone } = await seatedPhone();
  const result = await order(phone, [{ menuItemId: "item-1", quantity: 1 }, { menuItemId: "drink-1", quantity: 2 }]);
  assert.equal(result.status, 201);
  assert.equal(result.body.orders.length, 2);
  assert.equal(result.body.total, Math.round((25.5 + 12) * 100) / 100);

  const orders = fakeDb.all("orders");
  const kitchen = orders.find((item) => item.station === "kitchen")!;
  const drinks = orders.find((item) => item.station === "ready")!;
  assert.equal(kitchen.status, "received", "prato espera a cozinha");
  assert.equal(drinks.status, "ready", "bebida já nasce pronta, sem etapa de preparo");
  assert.equal(kitchen.groupCode, drinks.groupCode);
  assert.equal(fakeDb.all("tableSessions")[0].completedOrdersCount, 1, "a cota conta o carrinho, não a divisão interna");

  const listed = await json(await myOrders(phone.request("/api/public/orders")));
  assert.deepEqual(listed.orders.map((item: { station: string }) => item.station).sort(), ["kitchen", "ready"]);
});

test("só bebidas: um pedido já pronto; produto pode forçar ir para a cozinha", async () => {
  const { phone } = await seatedPhone();
  const drinksOnly = await order(phone, [{ menuItemId: "drink-1", quantity: 1 }]);
  assert.equal(drinksOnly.body.orders.length, 1);
  assert.equal(fakeDb.all("orders")[0].status, "ready");

  await fakeDb.collection("menuItems").doc("drink-1").update({ station: "kitchen" });
  await order(phone, [{ menuItemId: "drink-1", quantity: 1 }]);
  const latest = fakeDb.all("orders").find((item) => item.id !== fakeDb.all("orders")[0].id && item.status === "received");
  assert.ok(latest, "com setor 'cozinha' definido no produto, a bebida espera a cozinha");
});

test("cozinha marca pronto com um toque", async () => {
  const { phone } = await seatedPhone();
  const created = await order(phone, [{ menuItemId: "item-1", quantity: 1 }]);
  const response = await transition(staffRequest("/api/admin/order/transition", KITCHEN_UID, { orderId: created.body.orderId, nextStatus: "ready" }));
  assert.equal(response.status, 200);
  const stored = fakeDb.all("orders")[0];
  assert.equal(stored.status, "ready");
  assert.ok(stored.readyAt);
});

test("encerrar marca prontos como entregues sozinho e pede confirmação se algo está na cozinha", async () => {
  const { phone, publicToken } = await seatedPhone();
  await order(phone, [{ menuItemId: "item-1", quantity: 1 }, { menuItemId: "drink-1", quantity: 1 }]);
  await callWaiter(phone.request("/api/public/waiter-call", { method: "POST", headers: { "x-csrf-token": phone.csrf }, body: { reason: "fazer pagamento" } }));

  const blocked = await closeTable(staffRequest("/api/admin/table/close", ADMIN_UID, { tableId: "table-1" }));
  assert.equal(blocked.status, 409);
  const body = await json(blocked);
  assert.equal(body.code, "kitchen_pending");
  assert.equal(body.pending.length, 1, "só o prato está na cozinha; a bebida pronta não bloqueia");

  const forced = await closeTable(staffRequest("/api/admin/table/close", ADMIN_UID, { tableId: "table-1", force: true }));
  assert.equal(forced.status, 200);
  assert.equal((await json(forced)).autoDelivered, 2);
  assert.ok(fakeDb.all("orders").every((item) => item.status === "delivered" && item.autoDelivered === true));
  assert.ok(fakeDb.all("waiterCalls").every((call) => call.status === "completed"), "chamados da mesa são concluídos ao encerrar");
  assert.equal(fakeDb.all("waiterCallLocks").length, 0);

  const scanned = await getTable(new Browser().request(`/api/public/table/${publicToken}`), { params: Promise.resolve({ token: publicToken }) });
  assert.equal((await json(scanned)).access, "no_session");
});

test("encerrar sem nada na cozinha não pede confirmação", async () => {
  const { phone } = await seatedPhone();
  const created = await order(phone, [{ menuItemId: "item-1", quantity: 1 }]);
  await transition(staffRequest("/api/admin/order/transition", KITCHEN_UID, { orderId: created.body.orderId, nextStatus: "ready" }));
  const closed = await closeTable(staffRequest("/api/admin/table/close", ADMIN_UID, { tableId: "table-1" }));
  assert.equal(closed.status, 200);
  assert.equal(fakeDb.all("orders")[0].status, "delivered");
});

test("excluir mesa arquiva, mantém histórico e pode ser restaurada", async () => {
  const { phone, publicToken } = await seatedPhone();
  await order(phone, [{ menuItemId: "item-1", quantity: 1 }]);

  const busy = await archiveTable(staffRequest("/api/admin/table/archive", ADMIN_UID, { tableId: "table-1", archived: true }));
  assert.equal(busy.status, 409, "mesa ocupada não pode ser excluída");

  await closeTable(staffRequest("/api/admin/table/close", ADMIN_UID, { tableId: "table-1", force: true }));
  const archived = await archiveTable(staffRequest("/api/admin/table/archive", ADMIN_UID, { tableId: "table-1", archived: true }));
  assert.equal(archived.status, 200);
  assert.ok(fakeDb.all("tables")[0].archivedAt);
  assert.equal(fakeDb.all("orders").length, 1, "pedidos continuam no histórico");
  const scanned = await getTable(new Browser().request(`/api/public/table/${publicToken}`), { params: Promise.resolve({ token: publicToken }) });
  assert.equal(scanned.status, 423, "QR de mesa excluída não abre");

  const kitchenTry = await archiveTable(staffRequest("/api/admin/table/archive", KITCHEN_UID, { tableId: "table-1", archived: false }));
  assert.equal(kitchenTry.status, 403);
  const restored = await archiveTable(staffRequest("/api/admin/table/archive", ADMIN_UID, { tableId: "table-1", archived: false }));
  assert.equal(restored.status, 200);
  assert.equal(fakeDb.all("tables")[0].archivedAt, null);
  assert.equal((await getTable(new Browser().request(`/api/public/table/${publicToken}`), { params: Promise.resolve({ token: publicToken }) })).status, 200);
});

test("cozinha cancela só o que ainda está na cozinha e não marca entrega", async () => {
  const { phone } = await seatedPhone();
  await order(phone, [{ menuItemId: "item-1", quantity: 1 }, { menuItemId: "drink-1", quantity: 1 }]);
  const kitchenOrder = fakeDb.all("orders").find((item) => item.station === "kitchen")!;
  const drinks = fakeDb.all("orders").find((item) => item.station === "ready")!;
  const move = (uid: string, orderId: string, nextStatus: string, reason?: string) => transition(staffRequest("/api/admin/order/transition", uid, { orderId, nextStatus, ...(reason ? { reason } : {}) }));

  assert.equal((await move(KITCHEN_UID, drinks.id, "delivered")).status, 403, "entrega é do salão");
  assert.equal((await move(KITCHEN_UID, drinks.id, "cancelled", "acabou o suco")).status, 403, "pedido pronto: só o salão cancela");
  assert.equal((await move(KITCHEN_UID, kitchenOrder.id, "cancelled", "acabou o frango")).status, 200, "a cozinha cancela o que não consegue fazer");
  assert.equal((await move(ADMIN_UID, drinks.id, "delivered")).status, 200);
});
