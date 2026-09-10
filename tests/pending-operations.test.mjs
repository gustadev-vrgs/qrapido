import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("ciclo de chamados protege duplicatas, permissões e permite novo após conclusão", () => {
  const publicRoute = source("src/app/api/public/waiter-call/route.ts");
  const adminRoute = source("src/app/api/admin/waiter-calls/route.ts");
  assert.match(publicRoute, /waiterCallLocks/);
  assert.match(publicRoute, /DUPLICATE_CALL/);
  assert.match(publicRoute, /waiterCallEnabled === false/);
  assert.match(adminRoute, /\["admin", "manager", "attendant"\]/);
  assert.match(adminRoute, /action: z\.enum\(\["attend", "complete"\]\)/);
  assert.match(adminRoute, /call\.status !== expected/);
  assert.match(adminRoute, /tx\.delete\(db\.collection\("waiterCallLocks"\)/);
});

test("configurações são aplicadas no servidor e refletidas no checkout", () => {
  const api = source("src/app/api/public/order/route.ts");
  const page = source("src/app/mesa/[token]/page.tsx");
  for (const setting of ["serviceFeePercent", "acceptedPaymentMethods", "requireCustomerName", "allowCustomerNotes"]) assert.match(api, new RegExp(setting));
  assert.match(api, /paymentMethod !== "cash"/);
  assert.match(api, /changeFor < total/);
  assert.match(page, /checkoutTotal/);
  assert.match(page, /allowCustomerNotes !== false/);
});

test("mapper de pedidos mantém campos obrigatórios na saída do schema", () => {
  const schema = source("src/lib/schemas/domain.ts");
  const api = source("src/app/api/public/order/route.ts");
  const mapper = source("src/lib/data/mappers/domain-mappers.ts");
  assert.match(schema, /sessionToken: z\.string\(\)\.min\(16\)\.max\(128\)\.default/);
  assert.doesNotMatch(schema, /sessionToken:.*optional\(\).*default/);
  assert.match(schema, /duplicateGuardHash: z\.string\(\)\.min\(8\)\.max\(128\)\.default/);
  assert.match(api, /sessionToken: session\.sessionToken/);
  assert.match(api, /duplicateGuardHash: contentHash/);
  assert.match(mapper, /parseWithSchema\(orderSchema[\s\S]*\) as Order/);
});

test("relatórios paginam além de 500 e exportam a mesma coleção integral", () => {
  const io = source("src/lib/data/helpers/firestore-io.ts");
  const report = source("src/app/(dashboard)/dashboard/relatorios/page.tsx");
  assert.match(io, /readPeriodPaginated/);
  assert.match(io, /pageSize = 250/);
  assert.match(io, /startAfter\(cursor\)/);
  assert.match(report, /displayedOrders = orderedOrders\.slice\(0, 50\)/);
  assert.match(report, /\.\.\.orderedOrders\.map/);
  const generated = Array.from({ length: 751 }, (_, index) => ({ id: index }));
  const pages = Array.from({ length: Math.ceil(generated.length / 250) }, (_, index) => generated.slice(index * 250, (index + 1) * 250)).flat();
  assert.equal(pages.length, 751);
});

test("pagamentos e histórico não inferem confirmação pela entrega", () => {
  const calculations = source("src/lib/utils/report-calculations.ts");
  const orderApi = source("src/app/api/public/order/route.ts");
  assert.match(calculations, /financialReceiptConfirmed === true/);
  assert.match(calculations, /current\.delivered \+= 1/);
  assert.match(calculations, /current\.simulated \+= 1/);
  assert.match(orderApi, /categoryNameSnapshot/);
});

test("QR usa domínio atual e carrinho fica isolado por atendimento", () => {
  const urls = source("src/lib/utils/public-url.ts");
  const page = source("src/app/mesa/[token]/page.tsx");
  assert.match(urls, /return buildPublicTableUrl\(input\.publicToken, origin\)/);
  assert.doesNotMatch(page, /startsWith\("qrapido-cart-"\)/);
  assert.match(page, /qrapido-cart-\$\{data\.session\.id\}/);
});
