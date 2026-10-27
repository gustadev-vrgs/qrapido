import assert from "node:assert/strict";
import test from "node:test";

import { POST as setAvailability } from "@/app/api/admin/menu/availability/route";
import { POST as uploadImage } from "@/app/api/admin/menu/image/route";
import { POST as openTable } from "@/app/api/admin/table/open/route";
import { GET as menuImage } from "@/app/api/public/menu-image/[itemId]/route";
import { GET as getTable } from "@/app/api/public/table/[token]/route";
import { POST as access } from "@/app/api/public/session/access/route";
import { POST as createOrder } from "@/app/api/public/order/route";
import { restaurantWeekday } from "@/lib/utils/menu-options";

import { fakeDb } from "../fakes/firebase-admin";
import { ADMIN_UID, Browser, json, KITCHEN_UID, seedRestaurant, staffRequest } from "./helpers";

const PF_GROUPS = [
  { id: "acomp", name: "Acompanhamento", min: 1, max: 1, options: [{ id: "arroz", name: "Arroz e feijão", price: 0 }, { id: "tropeiro", name: "Feijão tropeiro", price: 2 }] },
  { id: "add", name: "Adicionais", min: 0, max: 2, options: [{ id: "ovo", name: "Ovo frito", price: 3 }, { id: "bacon", name: "Bacon", price: 4 }, { id: "batata", name: "Batata frita", price: 5 }] }
];

let seq = 0;
async function seated() {
  const { publicToken } = seedRestaurant();
  await fakeDb.collection("menuItems").doc("item-1").update({ optionGroups: PF_GROUPS });
  const opened = await json(await openTable(staffRequest("/api/admin/table/open", ADMIN_UID, { tableId: "table-1" })));
  const phone = new Browser();
  const granted = await access(phone.request("/api/public/session/access", { method: "POST", body: { publicToken, accessCode: opened.attendanceCode } }));
  phone.absorb(granted);
  phone.csrf = (await json(granted)).csrfToken;
  return { phone, publicToken };
}
async function order(phone: Browser, items: unknown[]) {
  const response = await createOrder(phone.request("/api/public/order", { method: "POST", headers: { "x-csrf-token": phone.csrf, "idempotency-key": `pf-${++seq}-${Date.now()}` }, body: { items, paymentMethod: "cash", paymentMode: "counter" } }));
  return { status: response.status, body: await json(response) };
}

test("PF com acompanhamento e adicionais: preço e escolhas calculados no servidor", async () => {
  const { phone } = await seated();
  const result = await order(phone, [{ menuItemId: "item-1", quantity: 2, options: [{ groupId: "acomp", optionId: "tropeiro" }, { groupId: "add", optionId: "ovo" }] }]);
  assert.equal(result.status, 201);
  const item = fakeDb.all("orders")[0].items[0];
  assert.equal(item.priceSnapshot, 25.5 + 2 + 3);
  assert.equal(item.total, (25.5 + 2 + 3) * 2);
  assert.deepEqual(item.options.map((option: { name: string }) => option.name), ["Feijão tropeiro", "Ovo frito"]);
});

test("escolha obrigatória faltando, demais ou inexistente é recusada", async () => {
  const { phone } = await seated();
  const missing = await order(phone, [{ menuItemId: "item-1", quantity: 1 }]);
  assert.equal(missing.status, 409);
  assert.equal(missing.body.code, "option_invalid");
  assert.match(missing.body.error, /Acompanhamento/);
  const tooMany = await order(phone, [{ menuItemId: "item-1", quantity: 1, options: [{ groupId: "acomp", optionId: "arroz" }, { groupId: "add", optionId: "ovo" }, { groupId: "add", optionId: "bacon" }, { groupId: "add", optionId: "batata" }] }]);
  assert.equal(tooMany.status, 409);
  const unknown = await order(phone, [{ menuItemId: "item-1", quantity: 1, options: [{ groupId: "acomp", optionId: "lagosta" }] }]);
  assert.equal(unknown.status, 409);
  assert.equal(fakeDb.all("orders").length, 0);
});

test("prato do dia só aparece e só pode ser pedido nos dias marcados", async () => {
  const { phone, publicToken } = await seated();
  const today = restaurantWeekday();
  await fakeDb.collection("menuItems").doc("drink-1").update({ availableDays: [(today + 1) % 7] });
  await fakeDb.collection("menuItems").doc("item-1").update({ availableDays: [today], optionGroups: [] });
  const menu = await json(await getTable(new Browser().request(`/api/public/table/${publicToken}`), { params: { token: publicToken } }));
  const ids = menu.items.map((item: { id: string }) => item.id);
  assert.ok(!ids.includes("drink-1"), "fora do dia não aparece");
  assert.equal(menu.items.find((item: { id: string }) => item.id === "item-1").dailySpecial, true);
  const blocked = await order(phone, [{ menuItemId: "drink-1", quantity: 1 }]);
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.code, "item_unavailable");
});

test("cozinha marca esgotado com um toque e o item some do cardápio do cliente", async () => {
  const { publicToken } = seedRestaurant();
  const response = await setAvailability(staffRequest("/api/admin/menu/availability", KITCHEN_UID, { itemId: "drink-1", isAvailable: false }));
  assert.equal(response.status, 200);
  const menu = await json(await getTable(new Browser().request(`/api/public/table/${publicToken}`), { params: { token: publicToken } }));
  assert.ok(!menu.items.some((item: { id: string }) => item.id === "drink-1"));
  assert.equal((await setAvailability(staffRequest("/api/admin/menu/availability", KITCHEN_UID, { itemId: "nao-existe", isAvailable: true }))).status, 404);
});

test("foto do prato: salva sem Storage, é servida com cache e pode ser removida", async () => {
  seedRestaurant();
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
  const dataUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  assert.equal((await uploadImage(staffRequest("/api/admin/menu/image", KITCHEN_UID, { itemId: "item-1", dataUrl }))).status, 403, "só gerente/admin troca foto");

  const saved = await json(await uploadImage(staffRequest("/api/admin/menu/image", ADMIN_UID, { itemId: "item-1", dataUrl })));
  assert.match(saved.imageUrl, /^\/api\/public\/menu-image\/item-1\?v=/);
  assert.equal(fakeDb.all("menuItems").find((item) => item.id === "item-1")!.imageUrl, saved.imageUrl);

  const served = await menuImage(new Browser().request("/api/public/menu-image/item-1"), { params: { itemId: "item-1" } });
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("content-type"), "image/jpeg");
  assert.match(served.headers.get("cache-control") ?? "", /immutable/);
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), jpeg);

  const huge = `data:image/jpeg;base64,${Buffer.alloc(400 * 1024, 1).toString("base64")}`;
  assert.equal((await uploadImage(staffRequest("/api/admin/menu/image", ADMIN_UID, { itemId: "item-1", dataUrl: huge }))).status, 413);
  assert.equal((await uploadImage(staffRequest("/api/admin/menu/image", ADMIN_UID, { itemId: "item-1", dataUrl: "data:text/html;base64,PHA+" }))).status, 400);

  assert.equal((await uploadImage(staffRequest("/api/admin/menu/image", ADMIN_UID, { itemId: "item-1", dataUrl: null }))).status, 200);
  assert.equal(fakeDb.all("menuItems").find((item) => item.id === "item-1")!.imageUrl, null);
  assert.equal((await menuImage(new Browser().request("/api/public/menu-image/item-1"), { params: { itemId: "item-1" } })).status, 404);
});
