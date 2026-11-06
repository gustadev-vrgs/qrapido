import assert from "node:assert/strict";
import test from "node:test";

import { POST as createStaffOrder } from "@/app/api/admin/order/create/route";
import { POST as review } from "@/app/api/admin/order/review/route";
import { POST as changeTeam } from "@/app/api/admin/staff/route";
import { POST as renewCode } from "@/app/api/admin/table/code/route";
import { POST as openTable } from "@/app/api/admin/table/open/route";
import { POST as access } from "@/app/api/public/session/access/route";
import { POST as createOrder } from "@/app/api/public/order/route";

import { fakeDb } from "../fakes/firebase-admin";
import { ADMIN_UID, Browser, json, KITCHEN_UID, seedRestaurant, staffRequest } from "./helpers";

let seq = 0;
async function seated() {
  const { publicToken } = seedRestaurant();
  const opened = await json(await openTable(staffRequest("/api/admin/table/open", ADMIN_UID, { tableId: "table-1", peopleCount: 2 })));
  const phone = new Browser();
  const granted = await access(phone.request("/api/public/session/access", { method: "POST", body: { publicToken, accessCode: opened.attendanceCode } }));
  phone.absorb(granted);
  phone.csrf = (await json(granted)).csrfToken;
  return { phone, publicToken, code: opened.attendanceCode as string };
}
const order = (phone: Browser, items: unknown[]) => createOrder(phone.request("/api/public/order", { method: "POST", headers: { "x-csrf-token": phone.csrf, "idempotency-key": `fraude-${++seq}-${Date.now()}` }, body: { items, paymentMethod: "cash", paymentMode: "counter" } }));

test("pedido fora do comum chega marcado para conferir com a mesa (sem bloquear)", async () => {
  const { phone } = await seated();
  const normal = await order(phone, [{ menuItemId: "item-1", quantity: 2 }, { menuItemId: "drink-1", quantity: 2 }]);
  assert.equal(normal.status, 201);
  assert.ok(fakeDb.all("orders").every((item) => !item.riskFlags), "pedido normal não é marcado");

  const big = await order(phone, [{ menuItemId: "item-1", quantity: 15 }, { menuItemId: "drink-1", quantity: 1 }]);
  assert.equal(big.status, 201, "o pedido entra mesmo assim");
  const flagged = fakeDb.all("orders").filter((item) => item.riskFlags?.length);
  assert.equal(flagged.length, 2, "a parte da cozinha e a das bebidas recebem o aviso");
  assert.ok(flagged[0].riskFlags.includes("big_quantity"));
  assert.ok(flagged[0].riskFlags.includes("high_value"));

  const reviewed = await review(staffRequest("/api/admin/order/review", KITCHEN_UID, { orderId: flagged[0].id }));
  assert.equal(reviewed.status, 200);
  assert.ok(fakeDb.all("orders").filter((item) => item.riskFlags?.length).every((item) => item.riskReviewedAt), "conferir uma parte libera o carrinho inteiro");
});

test("muitos pedidos seguidos são marcados; pedido do garçom nunca é marcado", async () => {
  const { phone } = await seated();
  for (let index = 0; index < 3; index += 1) assert.equal((await order(phone, [{ menuItemId: "drink-1", quantity: 1 }])).status, 201);
  assert.equal((await order(phone, [{ menuItemId: "drink-1", quantity: 1 }])).status, 201);
  const last = fakeDb.all("orders").sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || String(b.groupCode).localeCompare(String(a.groupCode)))[0];
  assert.deepEqual(last.riskFlags, ["rapid_orders"]);

  const request = staffRequest("/api/admin/order/create", ADMIN_UID, { tableId: "table-1", items: [{ menuItemId: "item-1", quantity: 20 }] });
  request.headers.set("idempotency-key", "garcom-grande-1234567890");
  assert.equal((await createStaffOrder(request)).status, 201);
  const staffOrder = fakeDb.all("orders").find((item) => item.createdByStaffId);
  assert.equal(staffOrder.riskFlags, undefined);
});

test("chute de código: tentativas erradas ficam contadas até a equipe gerar um código novo", async () => {
  const { publicToken, code } = await seated();
  for (let index = 0; index < 10; index += 1) {
    const wrong = await access(new Browser().request("/api/public/session/access", { method: "POST", headers: { "x-forwarded-for": `10.0.0.${index}` }, body: { publicToken, accessCode: code === "000000" ? "111111" : "000000" } }));
    assert.equal(wrong.status, 401);
  }
  // A real diner typing the right code does not hide the attempts from the team.
  assert.equal((await access(new Browser().request("/api/public/session/access", { method: "POST", headers: { "x-forwarded-for": "10.0.1.1" }, body: { publicToken, accessCode: code } }))).status, 200);
  assert.equal(fakeDb.all("tableSessions")[0].accessFailedAttempts, 10);
  assert.equal((await renewCode(staffRequest("/api/admin/table/code", ADMIN_UID, { tableId: "table-1" }))).status, 200);
  assert.equal(fakeDb.all("tableSessions")[0].accessFailedAttempts, 0);
});

test("mudanças na equipe ficam no registro de auditoria", async () => {
  seedRestaurant();
  const created = await json(await changeTeam(staffRequest("/api/admin/staff", ADMIN_UID, { action: "create", name: "Rita", email: "rita@r.com", password: "senha12345", role: "attendant" })));
  await changeTeam(staffRequest("/api/admin/staff", ADMIN_UID, { action: "update", uid: created.uid, isActive: false }));
  const log = fakeDb.all("auditLog");
  assert.deepEqual(log.map((entry) => entry.type).sort(), ["staff_created", "staff_updated"]);
  assert.ok(log.every((entry) => entry.actorId === ADMIN_UID && entry.restaurantId));
  assert.match(log.find((entry) => entry.type === "staff_updated").message, /acesso tirado/);
});
