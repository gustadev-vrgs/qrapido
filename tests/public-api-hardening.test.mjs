import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("pedido reserva idempotência, cota e limites na mesma transação", () => {
  const source = read("src/app/api/public/order/route.ts");
  assert.match(source, /runTransaction/);
  assert.match(source, /tx\.get\(idempotencyRef\)/);
  assert.match(source, /IDEMPOTENCY_CONFLICT/);
  assert.match(source, /completedOrdersCount/);
  assert.match(source, /publicRateLimits/);
  assert.doesNotMatch(source, /duplicateFingerprint|Date\.now\(\).*fingerprint/);
});

test("preços, taxas e identidade do restaurante são definidos pelo servidor", () => {
  const source = read("src/app/api/public/order/route.ts");
  assert.match(source, /product\.restaurantId !== session\.restaurantId/);
  assert.match(source, /product\.isAvailable !== true/);
  assert.match(source, /priceSnapshot: money\(price\)/);
  assert.match(source, /serviceFee = money/);
  assert.match(source, /financialReceiptConfirmed: false/);
});

test("APIs rejeitam corpos grandes e mantêm limites no Firestore", () => {
  const helper = read("src/lib/server/public-api-security.ts");
  assert.match(helper, /reader\.cancel/);
  assert.match(helper, /BODY_TOO_LARGE/);
  assert.match(helper, /collection\("publicRateLimits"\)/);
  assert.match(helper, /Retry-After/);
});

test("cliente reutiliza chave e CSV neutraliza fórmulas", () => {
  const client = read("src/app/mesa/[token]/page.tsx");
  const reports = read("src/app/(dashboard)/dashboard/relatorios/page.tsx");
  assert.match(client, /localStorage\.getItem\(attemptStorageKey\)/);
  assert.match(client, /"Idempotency-Key": idempotencyKey/);
  assert.match(reports, /\[=\+\\-@\]/);
});
