import assert from "node:assert/strict";
import test from "node:test";

import { POST as manageMenu } from "@/app/api/admin/menu/manage/route";
import { POST as deleteOrder } from "@/app/api/admin/order/delete/route";
import { POST as changeItems } from "@/app/api/admin/order/items/route";
import { POST as transition } from "@/app/api/admin/order/transition/route";
import { POST as staffChange } from "@/app/api/admin/staff/route";
import { POST as closeTable } from "@/app/api/admin/table/close/route";
import { POST as openTable } from "@/app/api/admin/table/open/route";
import { POST as access } from "@/app/api/public/session/access/route";
import { POST as createOrder } from "@/app/api/public/order/route";

import { fakeAuth, fakeDb } from "../fakes/firebase-admin";
import { ADMIN_UID, Browser, json, KITCHEN_UID, RESTAURANT_ID, seedRestaurant, staffRequest } from "./helpers";

const menu = (body: unknown, uid = ADMIN_UID) => manageMenu(staffRequest("/api/admin/menu/manage", uid, body));

test("cardápio: excluir item apaga a foto; duplicar copia a foto e começa escondido", async () => {
  seedRestaurant();
  await fakeDb.collection("menuImages").doc("item-1").set({ restaurantId: RESTAURANT_ID, contentType: "image/jpeg", data: "AAAA", bytes: 3 });
  await fakeDb.collection("menuItems").doc("item-1").update({ imageUrl: "/api/public/menu-image/item-1?v=1" });

  assert.equal((await menu({ action: "delete_item", itemId: "item-1" }, KITCHEN_UID)).status, 403, "cozinha não mexe no cardápio");
  const copy = await json(await menu({ action: "duplicate_item", itemId: "item-1" }));
  const copied = fakeDb.all("menuItems").find((item) => item.id === copy.itemId);
  assert.equal(copied.name, "X-Burger (cópia)");
  assert.equal(copied.isActive, false);
  assert.match(copied.imageUrl, new RegExp(`^/api/public/menu-image/${copy.itemId}\\?v=`));
  assert.ok(fakeDb.all("menuImages").some((image) => image.id === copy.itemId), "a foto foi copiada");

  assert.equal((await menu({ action: "delete_item", itemId: "item-1" })).status, 200);
  assert.equal(fakeDb.all("menuItems").some((item) => item.id === "item-1"), false);
  assert.equal(fakeDb.all("menuImages").some((image) => image.id === "item-1"), false, "a foto saiu junto");
  assert.ok(fakeDb.all("menuImages").some((image) => image.id === copy.itemId), "a cópia mantém a foto dela");
  assert.ok(fakeDb.all("auditLog").some((entry) => entry.type === "menu_item_deleted"));
});

test("cardápio: excluir categoria com itens pede decisão, move ou exclui junto", async () => {
  seedRestaurant();
  assert.equal((await menu({ action: "delete_category", categoryId: "cat-1", items: "none" })).status, 409, "tem itens: precisa escolher");
  assert.equal((await menu({ action: "delete_category", categoryId: "cat-1", items: "move" })).status, 400, "mover sem destino");

  const moved = await json(await menu({ action: "delete_category", categoryId: "cat-1", items: "move", moveTo: "cat-drinks" }));
  assert.equal(moved.items, 2);
  assert.equal(fakeDb.all("menuCategories").some((category) => category.id === "cat-1"), false);
  assert.ok(fakeDb.all("menuItems").filter((item) => item.id === "item-1" || item.id === "item-2").every((item) => item.categoryId === "cat-drinks"));

  await menu({ action: "delete_category", categoryId: "cat-drinks", items: "delete" });
  assert.equal(fakeDb.all("menuItems").filter((item) => item.categoryId === "cat-drinks").length, 0);
  assert.equal((await menu({ action: "delete_category", categoryId: "cat-off", items: "none" })).status, 409, "Sazonal ainda tem a Sopa");
  assert.equal((await menu({ action: "delete_category", categoryId: "nao-existe", items: "none" })).status, 404);
});

test("pedido: tirar item recalcula o total com a taxa; tirar tudo é cancelar; conta fechada não muda", async () => {
  const { publicToken } = seedRestaurant({ withSettings: true });
  const opened = await json(await openTable(staffRequest("/api/admin/table/open", ADMIN_UID, { tableId: "table-1" })));
  const phone = new Browser();
  const granted = await access(phone.request("/api/public/session/access", { method: "POST", body: { publicToken, accessCode: opened.attendanceCode } }));
  phone.absorb(granted);
  phone.csrf = (await json(granted)).csrfToken;
  await createOrder(phone.request("/api/public/order", { method: "POST", headers: { "x-csrf-token": phone.csrf, "idempotency-key": `items-${Date.now()}` }, body: { items: [{ menuItemId: "item-1", quantity: 2 }, { menuItemId: "item-2", quantity: 1 }], paymentMethod: "cash", paymentMode: "counter" } }));
  const order = fakeDb.all("orders").find((item) => item.items.length === 2)!;
  const change = (body: Record<string, unknown>, uid = ADMIN_UID) => changeItems(staffRequest("/api/admin/order/items", uid, { orderId: order.id, reason: "cliente desistiu", ...body }));

  assert.equal((await change({ itemIndex: 0, quantity: 1 }, KITCHEN_UID)).status, 403, "cozinha não mexe na conta");
  assert.equal((await change({ itemIndex: 0, quantity: 3 })).status, 400, "só diminui");
  assert.equal((await changeItems(staffRequest("/api/admin/order/items", ADMIN_UID, { orderId: order.id, itemIndex: 0, quantity: 1, reason: "" }))).status, 400, "motivo obrigatório");

  const result = await json(await change({ itemIndex: 0, quantity: 1 }));
  const updated = fakeDb.all("orders").find((item) => item.id === order.id)!;
  assert.equal(updated.items[0].quantity, 1);
  assert.equal(updated.subtotal, 25.5 + 8);
  assert.equal(updated.serviceFee, 3.35, "10% de taxa do próprio pedido");
  assert.equal(updated.total, result.total);
  assert.equal(updated.total, 36.85);

  assert.equal((await change({ itemIndex: 1, quantity: 0 })).status, 200, "tira a linha do suco");
  assert.equal(fakeDb.all("orders").find((item) => item.id === order.id)!.items.length, 1);
  assert.equal((await change({ itemIndex: 0, quantity: 0 })).status, 409, "tirar tudo = cancelar");
  assert.ok(fakeDb.all("orderEvents").some((event) => event.type === "order_items_changed" && event.metadata.reason === "cliente desistiu"));
  assert.ok(fakeDb.all("auditLog").some((entry) => entry.type === "order_items_removed"));

  await closeTable(staffRequest("/api/admin/table/close", ADMIN_UID, { tableId: "table-1", force: true, paidWith: "cash" }));
  assert.equal((await change({ itemIndex: 0, quantity: 0 })).status, 409, "conta fechada");
});

test("equipe: excluir só quem já está sem acesso, nunca a si mesmo", async () => {
  seedRestaurant();
  const created = await json(await staffChange(staffRequest("/api/admin/staff", ADMIN_UID, { action: "create", name: "Joana", email: "joana@teste.com", password: "senha-forte-1", role: "attendant" })));
  const uid = created.uid;
  assert.equal((await staffChange(staffRequest("/api/admin/staff", ADMIN_UID, { action: "delete", uid }))).status, 409, "ainda tem acesso");
  assert.equal((await staffChange(staffRequest("/api/admin/staff", ADMIN_UID, { action: "delete", uid: ADMIN_UID }))).status, 400, "a própria conta");
  await staffChange(staffRequest("/api/admin/staff", ADMIN_UID, { action: "update", uid, isActive: false }));
  assert.equal((await staffChange(staffRequest("/api/admin/staff", ADMIN_UID, { action: "delete", uid }))).status, 200);
  assert.equal(fakeDb.all("staffUsers").some((member) => member.id === uid), false);
  assert.equal(fakeAuth.users.has(uid), false, "o login também foi apagado");
  assert.ok(fakeDb.all("auditLog").some((entry) => entry.type === "staff_deleted"));
});

test("pedido: só o administrador exclui, e só pedido entregue ou cancelado; fica na auditoria", async () => {
  const { publicToken } = seedRestaurant();
  await fakeDb.collection("staffUsers").doc("manager-uid-789").set({ uid: "manager-uid-789", email: "gerente@teste.com", name: "Gerente", role: "manager", restaurantId: RESTAURANT_ID, isActive: true });
  const opened = await json(await openTable(staffRequest("/api/admin/table/open", ADMIN_UID, { tableId: "table-1" })));
  const phone = new Browser();
  const granted = await access(phone.request("/api/public/session/access", { method: "POST", body: { publicToken, accessCode: opened.attendanceCode } }));
  phone.absorb(granted);
  phone.csrf = (await json(granted)).csrfToken;
  await createOrder(phone.request("/api/public/order", { method: "POST", headers: { "x-csrf-token": phone.csrf, "idempotency-key": `del-${Date.now()}` }, body: { items: [{ menuItemId: "item-1", quantity: 1 }], paymentMethod: "pix", paymentMode: "counter" } }));
  const order = fakeDb.all("orders")[0];
  const remove = (uid = ADMIN_UID, reason = "pedido de teste") => deleteOrder(staffRequest("/api/admin/order/delete", uid, { orderId: order.id, reason }));

  assert.equal((await remove("manager-uid-789")).status, 403, "gerente não exclui");
  assert.equal((await remove()).status, 409, "ainda na cozinha: cancelar antes");
  await transition(staffRequest("/api/admin/order/transition", ADMIN_UID, { orderId: order.id, nextStatus: "cancelled", reason: "teste de exclusão" }));
  assert.equal((await remove(ADMIN_UID, "")).status, 400, "motivo obrigatório");
  assert.equal((await remove()).status, 200);
  assert.equal(fakeDb.all("orders").length, 0);
  assert.equal(fakeDb.all("orderEvents").filter((event) => event.orderId === order.id).length, 0, "histórico do pedido sai junto");
  const audit = fakeDb.all("auditLog").find((entry) => entry.type === "order_deleted");
  assert.ok(audit, "registrado na auditoria");
  assert.equal(audit.metadata.order.orderCode, order.orderCode, "com a cópia do pedido");
});
