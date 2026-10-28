import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("APIs de mesa conferem restaurante autenticado e consulta de sessões é isolada", async () => {
  const [open, close] = await Promise.all([read("src/app/api/admin/table/open/route.ts"), read("src/app/api/admin/table/close/route.ts")]);
  for (const route of [open, close]) assert.match(route, /restaurantId !== staff\.staffUser\.restaurantId/);
  // Orders are queried by session (no composite index) and filtered by restaurant in memory.
  assert.match(close, /doc\.data\(\)\.restaurantId === staff\.staffUser\.restaurantId/);
});

test("autenticação distingue token inválido de infraestrutura", async () => {
  const auth = await read("src/lib/server/admin-auth.ts");
  assert.match(auth, /isInvalidToken\(error\).*401/s);
  assert.match(auth, /auth_infrastructure_error/);
  assert.match(auth, /staff_infrastructure_error/);
  assert.match(auth, /collection\("staffUsers"\)\.doc\(decoded\.uid\)/);
});

test("regras impedem troca de restaurante, autoelevação e campos operacionais indevidos", async () => {
  const rules = await read("firestore/firestore.rules");
  assert.match(rules, /sameRestaurant\(\)/);
  assert.match(rules, /staffId != request\.auth\.uid/);
  assert.match(rules, /hasOnly\(\['status'.*'updatedAt'\]\)/);
  assert.match(rules, /hasOnly\(\['read', 'updatedAt'\]\)/);
});

test("atendimentos, auditoria e métricas só são gravados pelo servidor; mesa só edita campos simples", async () => {
  const rules = await read("firestore/firestore.rules");
  assert.match(rules, /match \/tableSessions\/\{sessionId\}[\s\S]*?allow create, update, delete: if false/);
  assert.match(rules, /match \/orderEvents\/\{eventId\}[\s\S]*?allow create, update, delete: if false/);
  assert.match(rules, /match \/dailyMetrics\/\{metricId\}[\s\S]*?allow create, update, delete: if false/);
  assert.match(rules, /match \/tables\/\{tableId\}[\s\S]*?isTableEdit\(\)/);
  assert.match(rules, /request\.resource\.data\.status == 'free'/);
});
