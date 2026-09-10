import assert from "node:assert/strict";
import test from "node:test";
import report from "../.tmp/tests/utils/report-calculations.js";

const { calculateSummary, getPreviousPeriod, groupCategories, groupPayments, groupProducts, sessionDurationMinutes } = report;
const orders = [
  { status: "delivered", total: 100, paymentMethod: "pix", financialReceiptConfirmed: true, items: [{ menuItemId: "a", nameSnapshot: "Pizza", categoryNameSnapshot: "Pratos", quantity: 2, total: 100 }] },
  { status: "cancelled", total: 80, paymentMethod: "cash", items: [{ menuItemId: "b", nameSnapshot: "Suco", categoryNameSnapshot: "Bebidas", quantity: 4, total: 80 }] },
  { status: "received", total: 30, paymentMethod: "pix", items: [{ menuItemId: "c", nameSnapshot: "Água", quantity: 1, total: 30 }] }
];

test("relatório real ignora pedidos não faturáveis e calcula os agregados", () => {
  const result = calculateSummary(orders, []);
  assert.equal(result.revenue, 100);
  assert.equal(result.averageTicket, 100);
  assert.equal(Number(result.cancellationRate.toFixed(2)), 33.33);
  assert.equal(result.soldItems, 2);
});
test("agregadores reais preservam produtos, categorias e pagamentos", () => {
  const products = groupProducts(orders, [], []);
  assert.deepEqual(products.map(({ name, quantity, share }) => ({ name, quantity, share })), [{ name: "Pizza", quantity: 2, share: 100 }]);
  assert.equal(groupCategories(products)[0].name, "Pratos");
  const pix = groupPayments(orders).find((entry) => entry.method === "pix");
  assert.equal(pix.confirmed, 1);
  assert.equal(pix.pending, 1);
});
test("período anterior e duração usam as implementações exportadas", () => {
  const current = { start: new Date("2026-06-10T00:00:00Z"), end: new Date("2026-06-16T23:59:59Z") };
  const previous = getPreviousPeriod(current);
  assert.equal(previous.end - previous.start, current.end - current.start);
  assert.equal(sessionDurationMinutes({ startedAt: "2026-06-18T10:00:00Z", closedAt: "2026-06-18T11:30:00Z" }), 90);
  assert.equal(sessionDurationMinutes({ startedAt: "2026-06-18T10:00:00Z", closedAt: null }), null);
});
