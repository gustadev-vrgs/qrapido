import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expectJson, fetchWithTimeout } from "../helpers/http.mjs";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST,
  "Run these tests through npm run test:e2e with both Firebase emulators enabled.");

const project = process.env.GCLOUD_PROJECT || "qrapido-ci";
const fsBase = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${project}/databases/(default)/documents`;
const authBase = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`;
const encode = (v) => v === null ? { nullValue: null } : Array.isArray(v) ? { arrayValue: { values: v.map(encode) } } : typeof v === "object" ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k,x]) => [k, encode(x)])) } } : typeof v === "boolean" ? { booleanValue: v } : typeof v === "number" ? { doubleValue: v } : { stringValue: v };
async function seed(path, record) { const response = await fetchWithTimeout(`${fsBase}/${path}`, { method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(record).map(([k,v]) => [k, encode(v)])) }) }); await expectJson(response, 200, `seed ${path}`); }
const post = (path, body, headers = {}) => fetchWithTimeout(`http://127.0.0.1:3100${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const cookieOf = (response) => response.headers.get("set-cookie")?.split(";")[0];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const userResponse = await fetchWithTimeout(`${authBase}/accounts:signUp?key=fake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "e2e-admin@test.invalid", password: "test-only-password", returnSecureToken: true }) });
const user = await expectJson(userResponse, 200, "E2E signup");
assert.ok(user.localId && user.idToken, "Auth emulator must return a UID and ID token");
await seed(`staffUsers/${user.localId}`, { uid: user.localId, restaurantId: "restaurant-e2e", role: "admin", isActive: true, name: "E2E" });
await seed("restaurants/restaurant-e2e", { restaurantId: "restaurant-e2e", name: "E2E" });
await seed("tables/table-e2e", { restaurantId: "restaurant-e2e", label: "Mesa 1", number: 1, capacity: 4, status: "free", isActive: true });
await seed("menuCategories/category-e2e", { restaurantId: "restaurant-e2e", name: "Pratos", isActive: true, sortOrder: 1 });
await seed("menuItems/item-e2e", { restaurantId: "restaurant-e2e", categoryId: "category-e2e", name: "Prato", price: 25, isActive: true, isAvailable: true, sortOrder: 1 });
await seed("menuItems/foreign-item", { restaurantId: "other-restaurant", categoryId: "other", name: "Segredo", price: 1, isActive: true, isAvailable: true, sortOrder: 1 });
await seed("restaurantSettings/settings-e2e", { restaurantId: "restaurant-e2e", serviceFeePercent: 10, maxOrdersPerWindow: 2, antiSpamWindowSeconds: 300, waiterCallEnabled: true });

const nextBin = fileURLToPath(new URL("../../node_modules/next/dist/bin/next", import.meta.url));
const server = spawn(process.execPath, [nextBin, "start", "-p", "3100", "-H", "127.0.0.1"], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, FIREBASE_PROJECT_ID: project, GCLOUD_PROJECT: project, NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100" } });
let serverOutput = "";
let startupError;
const captureOutput = (chunk) => { serverOutput = (serverOutput + chunk.toString()).slice(-20_000); };
server.stdout.on("data", captureOutput);
server.stderr.on("data", captureOutput);
server.on("error", (error) => { startupError = error; });
const stopped = new Promise((resolve) => server.once("close", resolve));
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (startupError) throw startupError;
    if (server.exitCode !== null || server.signalCode !== null) throw new Error(`Next server exited before readiness (code ${server.exitCode}, signal ${server.signalCode})`);
    try {
      const health = await fetchWithTimeout("http://127.0.0.1:3100/api/health", { signal: AbortSignal.timeout(1_000) });
      ready = health.ok;
      await health.body?.cancel();
      if (ready) break;
    } catch {}
    await sleep(500);
  }
  assert.ok(ready, "Next server did not become healthy within the startup deadline");
  const opened = await post("/api/admin/table/open", { tableId: "table-e2e", label: "Mesa 1", number: 1, capacity: 4, currentPeopleCount: 2, activeSessionLimit: 4 }, { Authorization: `Bearer ${user.idToken}` });
  const opening = await expectJson(opened, 201, "open table");
  assert.ok(opening.qrCodeValue && opening.attendanceCode, "Opened table must return a QR URL and attendance code");
  const publicToken = new URL(opening.qrCodeValue).pathname.split("/").pop();
  const grants = [];
  for (let device = 0; device < 2; device++) { const access = await post("/api/public/session/access", { publicToken, accessCode: opening.attendanceCode }, { "x-forwarded-for": `127.0.0.${device + 2}` }); const grant = await expectJson(access, 200, `authorize device ${device + 1}`); const cookie = cookieOf(access); assert.ok(cookie && grant.csrfToken, "Access must return a cookie and CSRF token"); grants.push({ cookie, ...grant }); }
  assert.notEqual(grants[0].cookie, grants[1].cookie, "two phones must have independent grants");
  const headers = { Cookie: grants[0].cookie, "x-csrf-token": grants[0].csrfToken, "Idempotency-Key": "e2e-idempotency-0001" };
  const tampered = await post("/api/public/order", { items: [{ menuItemId: "foreign-item", quantity: 1 }], paymentMethod: "pix", paymentMode: "counter" }, headers); await expectJson(tampered, 409, "reject foreign menu item");
  const payload = { items: [{ menuItemId: "item-e2e", quantity: 2 }], paymentMethod: "pix", paymentMode: "counter" };
  const created = await post("/api/public/order", payload, headers); const order = await expectJson(created, 201, "create order"); assert.equal(order.total, 55);
  const replay = await post("/api/public/order", payload, headers); assert.equal((await expectJson(replay, 200, "replay order")).orderId, order.orderId);
  const call = await post("/api/public/waiter-call", { reason: "pedir ajuda" }, { Cookie: grants[1].cookie, "x-csrf-token": grants[1].csrfToken }); await expectJson(call, 201, "call waiter from second device");
  const duplicateCall = await post("/api/public/waiter-call", { reason: "pedir ajuda" }, { Cookie: grants[1].cookie, "x-csrf-token": grants[1].csrfToken }); await expectJson(duplicateCall, 409, "reject duplicate waiter call");
  console.log("E2E OK: abertura, dois celulares, isolamento, adulteração, idempotência, total servidor e chamado.");
} catch (error) {
  console.error("Next server output before E2E failure:\n" + serverOutput);
  throw error;
} finally {
  if (server.exitCode === null && server.signalCode === null) server.kill("SIGTERM");
  const forceStop = setTimeout(() => server.kill("SIGKILL"), 5_000);
  try { await stopped; } finally { clearTimeout(forceStop); }
}
