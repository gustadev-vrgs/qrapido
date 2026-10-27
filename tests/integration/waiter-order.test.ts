import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { POST as createStaffOrder } from "@/app/api/admin/order/create/route";
import { POST as openTable } from "@/app/api/admin/table/open/route";
import { POST as sessionAction } from "@/app/api/admin/table/session/route";

import { fakeDb } from "../fakes/firebase-admin";
import { ADMIN_UID, json, KITCHEN_UID, seedRestaurant, staffRequest } from "./helpers";

let seq = 0;
function staffOrder(uid: string, body: unknown, key = `garcom-pedido-${++seq}-${Date.now()}`): NextRequest {
  const request = staffRequest("/api/admin/order/create", uid, body);
  request.headers.set("idempotency-key", key);
  return request;
}

test("abrir mesa com um toque: sem formulário, 1 pessoa, e depois ajusta a quantidade", async () => {
  seedRestaurant();
  const opened = await openTable(staffRequest("/api/admin/table/open", ADMIN_UID, { tableId: "table-1" }));
  assert.equal(opened.status, 201);
  assert.match((await json(opened)).attendanceCode, /^\d{6}$/);
  assert.equal(fakeDb.all("tableSessions")[0].peopleCount, 1);

  const people = await sessionAction(staffRequest("/api/admin/table/session", ADMIN_UID, { tableId: "table-1", action: "people", peopleCount: 4 }));
  assert.equal(people.status, 200);
  assert.equal(fakeDb.all("tableSessions")[0].peopleCount, 4);
  assert.equal(fakeDb.all("tables").find((table) => table.id === "table-1")!.currentPeopleCount, 4);
  assert.equal(fakeDb.all("tableSessions")[0].status, "active", "ajustar pessoas não mexe no tempo nem no status");
});

test("garçom lança pedido: pratos vão para a cozinha, bebidas já prontas, preço do servidor", async () => {
  seedRestaurant();
  await openTable(staffRequest("/api/admin/table/open", ADMIN_UID, { tableId: "table-1" }));
  const response = await createStaffOrder(staffOrder(ADMIN_UID, { tableId: "table-1", items: [{ menuItemId: "item-1", quantity: 2, notes: "sem cebola" }, { menuItemId: "drink-1", quantity: 1 }] }));
  const body = await json(response);
  assert.equal(response.status, 201);
  assert.equal(body.orders.length, 2);

  const orders = fakeDb.all("orders");
  const kitchen = orders.find((order) => order.station === "kitchen")!;
  const drinks = orders.find((order) => order.station === "ready")!;
  assert.equal(kitchen.status, "received");
  assert.equal(drinks.status, "ready");
  assert.equal(kitchen.items[0].priceSnapshot, 25.5, "o preço vem do cardápio, não do celular");
  assert.equal(kitchen.items[0].notes, "sem cebola");
  assert.equal(kitchen.createdByStaffId, ADMIN_UID);
  assert.equal(kitchen.paymentMode, "waiter");
  assert.ok(fakeDb.all("orderEvents").some((event) => event.actorType === "staff" && event.type === "order_created"));
});

test("pedido do garçom não duplica com toque duplo (mesma chave)", async () => {
  seedRestaurant();
  await openTable(staffRequest("/api/admin/table/open", ADMIN_UID, { tableId: "table-1" }));
  const payload = { tableId: "table-1", items: [{ menuItemId: "item-1", quantity: 1 }] };
  const first = await createStaffOrder(staffOrder(ADMIN_UID, payload, "mesma-chave-1234567890"));
  const second = await createStaffOrder(staffOrder(ADMIN_UID, payload, "mesma-chave-1234567890"));
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal((await json(second)).replay, true);
  assert.equal(fakeDb.all("orders").length, 1);
});

test("mesa fechada, produto esgotado e cozinha não lançam pedido", async () => {
  seedRestaurant();
  const closed = await createStaffOrder(staffOrder(ADMIN_UID, { tableId: "table-1", items: [{ menuItemId: "item-1", quantity: 1 }] }));
  assert.equal(closed.status, 409);
  assert.equal((await json(closed)).code, "no_session");

  await openTable(staffRequest("/api/admin/table/open", ADMIN_UID, { tableId: "table-1" }));
  await fakeDb.collection("menuItems").doc("item-1").update({ isAvailable: false });
  const soldOut = await createStaffOrder(staffOrder(ADMIN_UID, { tableId: "table-1", items: [{ menuItemId: "item-1", quantity: 1 }] }));
  assert.equal(soldOut.status, 409);
  assert.equal((await json(soldOut)).code, "item_unavailable");

  const kitchen = await createStaffOrder(staffOrder(KITCHEN_UID, { tableId: "table-1", items: [{ menuItemId: "drink-1", quantity: 1 }] }));
  assert.equal(kitchen.status, 403);
  assert.equal(fakeDb.all("orders").length, 0);
});
