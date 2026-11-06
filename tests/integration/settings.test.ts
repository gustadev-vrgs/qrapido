import assert from "node:assert/strict";
import test from "node:test";

import { GET as readSettings, POST as saveSettings } from "@/app/api/admin/settings/route";

import { fakeDb } from "../fakes/firebase-admin";
import { ADMIN_UID, json, KITCHEN_UID, RESTAURANT_ID, seedRestaurant, staffRequest } from "./helpers";

const hours = { isOpen: true, open: "11:00", close: "15:00" };
const body = (overrides: Record<string, unknown> = {}) => ({
  restaurant: { name: "Cantina da Praça", phone: "(47) 3333-1234", address: "Rua das Flores, 10", legalName: "Cantina da Praça LTDA", document: "12.345.678/0001-90", ...overrides },
  settings: {
    acceptedPaymentMethods: ["pix", "cash"], pixKey: "12345678000190", pixReceiverName: "Cantina", pixReceiverCity: "Itajaí", pixInstructions: null,
    defaultSessionDurationMinutes: 180, antiSpamWindowSeconds: 60, maxOrdersPerWindow: 3, requireCustomerName: false, allowCustomerNotes: true,
    serviceFeePercent: 10, waiterCallEnabled: true, billRequestEnabled: true,
    businessHours: { monday: hours, tuesday: hours, wednesday: hours, thursday: hours, friday: hours, saturday: hours, sunday: { ...hours, isOpen: false } }
  }
});

test("Configurações carrega e salva pelo servidor", async () => {
  seedRestaurant({ withSettings: true });
  const loaded = await json(await readSettings(staffRequest("/api/admin/settings", ADMIN_UID, undefined, "GET")));
  assert.equal(loaded.restaurant.name, "Cantina Teste");
  assert.equal(loaded.settings.serviceFeePercent, 10);

  const saved = await saveSettings(staffRequest("/api/admin/settings", ADMIN_UID, body()));
  assert.equal(saved.status, 200, JSON.stringify(await saved.clone().json()));
  const restaurant = fakeDb.all("restaurants").find((item) => item.id === RESTAURANT_ID);
  assert.equal(restaurant.name, "Cantina da Praça");
  assert.equal(restaurant.document, "12.345.678/0001-90");
  const settings = fakeDb.all("restaurantSettings")[0];
  assert.deepEqual(settings.acceptedPaymentMethods, ["pix", "cash"]);
  assert.equal(settings.restaurantId, RESTAURANT_ID);

  const again = await json(await readSettings(staffRequest("/api/admin/settings", ADMIN_UID, undefined, "GET")));
  assert.equal(again.restaurant.legalName, "Cantina da Praça LTDA");
  assert.equal(again.settings.maxOrdersPerWindow, 3);
});

test("Configurações: cozinha não acessa; CNPJ errado e restaurante sem cadastro inicial são recusados", async () => {
  seedRestaurant();
  assert.equal((await readSettings(staffRequest("/api/admin/settings", KITCHEN_UID, undefined, "GET"))).status, 403);
  const empty = await json(await readSettings(staffRequest("/api/admin/settings", ADMIN_UID, undefined, "GET")));
  assert.equal(empty.settings, null, "sem configurações: a tela oferece o cadastro inicial");
  assert.equal((await saveSettings(staffRequest("/api/admin/settings", ADMIN_UID, body()))).status, 409);

  seedRestaurant({ withSettings: true });
  assert.equal((await saveSettings(staffRequest("/api/admin/settings", ADMIN_UID, body({ document: "123" })))).status, 400);
  assert.equal((await saveSettings(staffRequest("/api/admin/settings", ADMIN_UID, { ...body(), settings: { ...body().settings, acceptedPaymentMethods: [] } }))).status, 400);
  assert.equal(fakeDb.all("restaurants").find((item) => item.id === RESTAURANT_ID).name, "Cantina Teste", "nada mudou");
});
