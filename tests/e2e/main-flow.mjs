import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const project = process.env.GCLOUD_PROJECT || "qrapido-ci";
const fsBase = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${project}/databases/(default)/documents`;
const authBase = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`;
const encode = (v) => v === null ? { nullValue: null } : Array.isArray(v) ? { arrayValue: { values: v.map(encode) } } : typeof v === "object" ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k,x]) => [k, encode(x)])) } } : typeof v === "boolean" ? { booleanValue: v } : typeof v === "number" ? { doubleValue: v } : { stringValue: v };
async function seed(path, record) { const response = await fetch(`${fsBase}/${path}`, { method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(record).map(([k,v]) => [k, encode(v)])) }) }); assert.equal(response.status, 200, await response.text()); }
const post = (path, body, headers = {}) => fetch(`http://127.0.0.1:3100${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const cookieOf = (response) => response.headers.get("set-cookie")?.split(";")[0];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const userResponse = await fetch(`${authBase}/accounts:signUp?key=fake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "e2e-admin@test.invalid", password: "test-only-password", returnSecureToken: true }) });
const user = await userResponse.json();
await seed(`staffUsers/${user.localId}`, { uid: user.localId, restaurantId: "restaurant-e2e", role: "admin", isActive: true, name: "E2E" });
await seed("restaurants/restaurant-e2e", { restaurantId: "restaurant-e2e", name: "E2E" });
await seed("tables/table-e2e", { restaurantId: "restaurant-e2e", label: "Mesa 1", number: 1, capacity: 4, status: "free", isActive: true });
await seed("menuCategories/category-e2e", { restaurantId: "restaurant-e2e", name: "Pratos", isActive: true, sortOrder: 1 });
await seed("menuItems/item-e2e", { restaurantId: "restaurant-e2e", categoryId: "category-e2e", name: "Prato", price: 25, isActive: true, isAvailable: true, sortOrder: 1 });
await seed("menuItems/foreign-item", { restaurantId: "other-restaurant", categoryId: "other", name: "Segredo", price: 1, isActive: true, isAvailable: true, sortOrder: 1 });
await seed("restaurantSettings/settings-e2e", { restaurantId: "restaurant-e2e", serviceFeePercent: 10, maxOrdersPerWindow: 2, antiSpamWindowSeconds: 300, waiterCallEnabled: true });

const server = spawn("npm", ["run", "start", "--", "-p", "3100"], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, FIREBASE_PROJECT_ID: project, GCLOUD_PROJECT: project, NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100" } });
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch("http://127.0.0.1:3100/api/health")).ok) break; } catch {} await sleep(500); if (i === 59) throw new Error("Next server did not start"); }
  const opened = await post("/api/admin/table/open", { tableId: "table-e2e", label: "Mesa 1", number: 1, capacity: 4, currentPeopleCount: 2, activeSessionLimit: 4 }, { Authorization: `Bearer ${user.idToken}` });
  assert.equal(opened.status, 201, await opened.text()); const opening = await opened.json();
  const publicToken = new URL(opening.qrCodeValue).pathname.split("/").pop();
  const grants = [];
  for (let device = 0; device < 2; device++) { const access = await post("/api/public/session/access", { publicToken, accessCode: opening.attendanceCode }, { "x-forwarded-for": `127.0.0.${device + 2}` }); assert.equal(access.status, 200, await access.text()); grants.push({ cookie: cookieOf(access), ...(await access.json()) }); }
  assert.notEqual(grants[0].cookie, grants[1].cookie, "two phones must have independent grants");
  const headers = { Cookie: grants[0].cookie, "x-csrf-token": grants[0].csrfToken, "Idempotency-Key": "e2e-idempotency-0001" };
  const tampered = await post("/api/public/order", { items: [{ menuItemId: "foreign-item", quantity: 1 }], paymentMethod: "pix", paymentMode: "counter" }, headers); assert.equal(tampered.status, 409);
  const payload = { items: [{ menuItemId: "item-e2e", quantity: 2 }], paymentMethod: "pix", paymentMode: "counter" };
  const created = await post("/api/public/order", payload, headers); assert.equal(created.status, 201, await created.text()); const order = await created.json(); assert.equal(order.total, 55);
  const replay = await post("/api/public/order", payload, headers); assert.equal(replay.status, 200); assert.equal((await replay.json()).orderId, order.orderId);
  const call = await post("/api/public/waiter-call", { reason: "pedir ajuda" }, { Cookie: grants[1].cookie, "x-csrf-token": grants[1].csrfToken }); assert.equal(call.status, 201, await call.text());
  const duplicateCall = await post("/api/public/waiter-call", { reason: "pedir ajuda" }, { Cookie: grants[1].cookie, "x-csrf-token": grants[1].csrfToken }); assert.equal(duplicateCall.status, 409);
  console.log("E2E OK: abertura, dois celulares, isolamento, adulteração, idempotência, total servidor e chamado.");
} finally { server.kill("SIGTERM"); }
