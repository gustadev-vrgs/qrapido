import assert from "node:assert/strict";
import test from "node:test";

import { POST as purge } from "@/app/api/admin/operations/purge-orders/route";
import { POST as availability } from "@/app/api/admin/menu/availability/route";
import { POST as reviewOrder } from "@/app/api/admin/order/review/route";
import { POST as transition } from "@/app/api/admin/order/transition/route";
import { GET as listStaff } from "@/app/api/admin/staff/route";
import { POST as archiveTable } from "@/app/api/admin/table/archive/route";
import { POST as closeTable } from "@/app/api/admin/table/close/route";
import { POST as newCode } from "@/app/api/admin/table/code/route";
import { POST as openTable } from "@/app/api/admin/table/open/route";
import { POST as access } from "@/app/api/public/session/access/route";
import { POST as createOrder } from "@/app/api/public/order/route";

import { fakeDb } from "../fakes/firebase-admin";
import { ADMIN_UID, Browser, json, RESTAURANT_ID, seedRestaurant, staffRequest } from "./helpers";

const OTHER_UID = "other-admin-uid-999";

/**
 * An administrator of another restaurant, with a valid login, must not see or change
 * anything of this restaurant even knowing its ids (table, order, menu item).
 */
test("administrador de outro restaurante não mexe em mesa, pedido, cardápio nem equipe daqui", async () => {
  const { publicToken } = seedRestaurant();
  await fakeDb.collection("staffUsers").doc(OTHER_UID).set({ uid: OTHER_UID, email: "dono@outro.com", name: "Outro", role: "admin", restaurantId: "outro-restaurante", isActive: true });

  const opened = await json(await openTable(staffRequest("/api/admin/table/open", ADMIN_UID, { tableId: "table-1" })));
  const phone = new Browser();
  const granted = await access(phone.request("/api/public/session/access", { method: "POST", body: { publicToken, accessCode: opened.attendanceCode } }));
  phone.absorb(granted);
  phone.csrf = (await json(granted)).csrfToken;
  await createOrder(phone.request("/api/public/order", { method: "POST", headers: { "x-csrf-token": phone.csrf, "idempotency-key": `tenant-${Date.now()}` }, body: { items: [{ menuItemId: "item-1", quantity: 1 }], paymentMethod: "pix", paymentMode: "counter" } }));
  const order = fakeDb.all("orders")[0];
  const before = JSON.stringify([fakeDb.all("orders"), fakeDb.all("tables"), fakeDb.all("tableSessions"), fakeDb.all("menuItems")]);

  const attempts: Array<[string, Response]> = [
    ["fechar mesa", await closeTable(staffRequest("/api/admin/table/close", OTHER_UID, { tableId: "table-1", force: true }))],
    ["novo código", await newCode(staffRequest("/api/admin/table/code", OTHER_UID, { tableId: "table-1" }))],
    ["arquivar mesa", await archiveTable(staffRequest("/api/admin/table/archive", OTHER_UID, { tableId: "table-1", archived: true }))],
    ["cancelar pedido", await transition(staffRequest("/api/admin/order/transition", OTHER_UID, { orderId: order.id, nextStatus: "cancelled", reason: "teste" }))],
    ["conferir pedido", await reviewOrder(staffRequest("/api/admin/order/review", OTHER_UID, { orderId: order.id }))],
    ["esgotar item", await availability(staffRequest("/api/admin/menu/availability", OTHER_UID, { itemId: "item-1", isAvailable: false }))]
  ];
  for (const [label, response] of attempts) {
    assert.ok([403, 404, 409].includes(response.status), `${label}: status ${response.status}`);
  }
  assert.equal(JSON.stringify([fakeDb.all("orders"), fakeDb.all("tables"), fakeDb.all("tableSessions"), fakeDb.all("menuItems")]), before, "nada mudou");

  const team = await json(await listStaff(staffRequest("/api/admin/staff", OTHER_UID, undefined, "GET")));
  assert.equal(team.team.some((member: { email: string }) => member.email === "admin@teste.com"), false, "não vê a equipe daqui");

  // Closing this restaurant's table later and purging from the other one leaves it intact.
  await closeTable(staffRequest("/api/admin/table/close", ADMIN_UID, { tableId: "table-1", force: true }));
  const purged = await json(await purge(staffRequest("/api/admin/operations/purge-orders", OTHER_UID, { until: null, confirm: "APAGAR" })));
  assert.equal(purged.tables, 0);
  assert.equal(fakeDb.all("orders").filter((item) => item.restaurantId === RESTAURANT_ID).length, 1);
});
