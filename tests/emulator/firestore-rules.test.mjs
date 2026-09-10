import assert from "node:assert/strict";
import test, { before } from "node:test";
import { expectJson, fetchWithTimeout } from "../helpers/http.mjs";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST,
  "Run these tests through npm run test:emulator with both Firebase emulators enabled.");

const project = process.env.GCLOUD_PROJECT || "qrapido-ci";
const fsBase = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${project}/databases/(default)/documents`;
const authBase = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`;
const value = (v) => typeof v === "boolean" ? { booleanValue: v } : typeof v === "number" ? { integerValue: String(v) } : { stringValue: v };
const fields = (record) => Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, value(entry)]));
async function write(path, data, token = "owner") { return fetchWithTimeout(`${fsBase}/${path}`, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields: fields(data) }) }); }
async function read(path, token) { return fetchWithTimeout(`${fsBase}/${path}`, { headers: { Authorization: `Bearer ${token}` } }); }
async function signup(email) {
  const response = await fetchWithTimeout(`${authBase}/accounts:signUp?key=fake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "integration-test-only", returnSecureToken: true }) });
  const data = await expectJson(response, 200, `signup ${email}`);
  assert.ok(data.localId && data.idToken, "Auth emulator must return a UID and ID token");
  return data;
}
let adminA, managerA, kitchenA, attendantB;
before(async () => {
  [adminA, managerA, kitchenA, attendantB] = await Promise.all([signup("admin-a@test.invalid"), signup("manager-a@test.invalid"), signup("kitchen-a@test.invalid"), signup("attendant-b@test.invalid")]);
  for (const [user, restaurantId, role] of [[adminA, "restaurant-a", "admin"], [managerA, "restaurant-a", "manager"], [kitchenA, "restaurant-a", "kitchen"], [attendantB, "restaurant-b", "attendant"]]) {
    await expectJson(await write(`staffUsers/${user.localId}`, { uid: user.localId, restaurantId, role, isActive: true, name: role }), 200, `seed staff ${role}`);
  }
  await expectJson(await write("tables/table-a", { restaurantId: "restaurant-a", number: 1, status: "active", isActive: true }), 200, "seed table A");
  await expectJson(await write("tables/table-b", { restaurantId: "restaurant-b", number: 1, status: "active", isActive: true }), 200, "seed table B");
  await expectJson(await write("orders/order-a", { restaurantId: "restaurant-a", status: "received" }), 200, "seed order A");
});

test("documentos de outro restaurante são invisíveis", async () => {
  assert.equal((await read("tables/table-a", attendantB.idToken)).status, 403);
  assert.equal((await read("tables/table-b", attendantB.idToken)).status, 200);
});
test("cozinha lê pedidos mas não altera mesa nem cria cardápio", async () => {
  assert.equal((await read("orders/order-a", kitchenA.idToken)).status, 200);
  assert.equal((await write("tables/table-a", { restaurantId: "restaurant-a", number: 2, status: "active", isActive: true }, kitchenA.idToken)).status, 403);
  assert.equal((await write("menuItems/kitchen-write", { restaurantId: "restaurant-a", name: "forbidden" }, kitchenA.idToken)).status, 403);
});
test("gerente administra seu restaurante, sem trocar o tenant", async () => {
  assert.equal((await write("menuItems/item-a", { restaurantId: "restaurant-a", name: "allowed" }, managerA.idToken)).status, 200);
  assert.equal((await write("tables/table-a", { restaurantId: "restaurant-b", number: 1, status: "active", isActive: true }, managerA.idToken)).status, 403);
});
test("SDK cliente nunca escreve pedido, grant, limites ou chamados", async () => {
  for (const path of ["orders/injected", "sessionAccessGrants/leak", "publicRateLimits/reset", "waiterCalls/fake"]) {
    assert.equal((await write(path, { restaurantId: "restaurant-a", status: "received" }, adminA.idToken)).status, 403, path);
  }
});
