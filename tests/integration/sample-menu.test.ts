import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";

import { POST as addSample } from "@/app/api/admin/menu/sample/route";
import { GET as getTable } from "@/app/api/public/table/[token]/route";
import { SAMPLE_ITEMS } from "@/lib/server/sample-menu";
import { menuItemSchema } from "@/lib/schemas/domain";

import { fakeDb } from "../fakes/firebase-admin";
import { ADMIN_UID, Browser, json, KITCHEN_UID, seedRestaurant, staffRequest } from "./helpers";

test("cardápio de exemplo: 5 pratos feitos + bebidas, com foto, sem duplicar ao repetir", async () => {
  const { publicToken } = seedRestaurant();
  const before = fakeDb.all("menuItems").length;
  const first = await json(await addSample(staffRequest("/api/admin/menu/sample", ADMIN_UID, {})));
  assert.equal(first.createdItems, SAMPLE_ITEMS.length);
  const added = fakeDb.all("menuItems").filter((item) => item.sample);
  assert.equal(added.filter((item) => fakeDb.all("menuCategories").find((category) => category.id === item.categoryId)?.name === "Pratos feitos").length, 5);
  for (const item of added) {
    assert.match(item.imageUrl, /^\/cardapio-exemplo\/[a-z-]+\.jpg$/);
    assert.ok(existsSync(`public${item.imageUrl}`), `imagem ${item.imageUrl} existe`);
    assert.ok(item.categoryId, `${item.name} tem categoria`);
  }
  assert.equal(fakeDb.all("menuCategories").filter((category) => category.name === "Bebidas").length, 1, "reaproveita a categoria Bebidas que já existia");

  const again = await json(await addSample(staffRequest("/api/admin/menu/sample", ADMIN_UID, {})));
  assert.equal(again.createdItems, 0);
  assert.equal(fakeDb.all("menuItems").length, before + SAMPLE_ITEMS.length);

  const menu = await json(await getTable(new Browser().request(`/api/public/table/${publicToken}`), { params: Promise.resolve({ token: publicToken }) }));
  assert.ok(menu.items.some((item: { name: string; optionGroups: unknown[] }) => item.name === "PF de frango grelhado" && item.optionGroups.length === 2));
  assert.equal((await addSample(staffRequest("/api/admin/menu/sample", KITCHEN_UID, {}))).status, 403);
});

test("itens de exemplo passam na validação do painel (dá para editar depois)", () => {
  for (const item of fakeDb.all("menuItems").filter((entry) => entry.sample)) {
    const parsed = menuItemSchema.omit({ id: true }).safeParse({ ...item, createdAt: item.createdAt, updatedAt: item.updatedAt });
    assert.ok(parsed.success, `${item.name}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues)}`);
  }
});
