import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("abertura concorrente mantém uma única sessão ativa", () => {
  const source = read("src/app/api/admin/table/open/route.ts");
  assert.match(source, /runTransaction/);
  assert.match(source, /where\("tableId", "==", table\.id\)/);
  assert.match(source, /session\.status === "active" && new Date\(session\.expiresAt\)\.getTime\(\) > nowMs/);
  assert.match(source, /currentSessionGroupId: sessionRef\.id/);
});

test("pedido e fechamento disputam a mesma mesa transacionalmente", () => {
  const order = read("src/app/api/public/order/route.ts");
  const close = read("src/app/api/admin/table/close/route.ts");
  assert.match(order, /tx\.get\(tableRef\)/);
  assert.match(order, /freshTable\.currentSessionGroupId !== session\.id/);
  assert.match(close, /runTransaction/);
  assert.match(close, /PENDING_ORDER_STATUSES/);
});

test("expiração preserva pedidos, pausa acessos e não trava a mesa", () => {
  const sessions = read("src/lib/server/public-session.ts");
  assert.match(sessions, /status: "expired"/);
  // Expired attendances no longer move the table to "blocked" (it could not be reopened).
  assert.doesNotMatch(sessions, /status: "blocked"/);
  assert.match(sessions, /resolveHistoricalAuthorizedSession/);
  assert.doesNotMatch(sessions, /collection\("orders"\).*delete/);
});

test("renovação e reabertura mantêm identidades de atendimento distintas", () => {
  const action = read("src/app/api/admin/table/session/route.ts");
  const open = read("src/app/api/admin/table/open/route.ts");
  assert.match(action, /action: z\.enum\(\["renew", "expire"\]\)/);
  assert.match(action, /renewedExpiresAt = new Date/);
  assert.match(open, /const sessionRef = db\.collection\("tableSessions"\)\.doc\(\)/);
  assert.match(open, /createSessionToken\(\)/);
});

test("cancelamento é idempotente e libera cota uma vez", () => {
  const source = read("src/app/api/admin/order/transition/route.ts");
  assert.match(source, /order\.status === parsed\.data\.nextStatus/);
  assert.match(source, /!order\.quotaReleasedAt/);
  assert.match(source, /Math\.max\(0/);
  assert.match(source, /cancellationReason/);
});

test("pedido e alerta são confirmados atomicamente", () => {
  const source = read("src/app/api/public/order/route.ts");
  assert.match(source, /tx\.set\(alertRef/);
  assert.match(source, /tx\.set\(eventRef/);
});

test("transição inválida é recusada no servidor e navegador não escreve pedidos", () => {
  const api = read("src/app/api/admin/order/transition/route.ts");
  const rules = read("firestore/firestore.rules");
  assert.match(api, /Transição de pedido não permitida/);
  assert.match(rules, /match \/orders\/\{orderId\}[\s\S]*allow create, update: if false/);
});
