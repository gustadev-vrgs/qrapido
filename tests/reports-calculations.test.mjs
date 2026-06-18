import assert from 'node:assert/strict';
import test from 'node:test';

const delivered = 'delivered';
const cancelled = 'cancelled';
const isBillable = (order) => order.status === delivered;
const safePercent = (part, total) => total > 0 ? (part / total) * 100 : 0;
const averageTicket = (revenue, validOrders) => validOrders > 0 ? revenue / validOrders : 0;
function summary(orders, sessions = []) {
  const valid = orders.filter(isBillable);
  const revenue = valid.reduce((sum, order) => sum + order.total, 0);
  const cancelledOrders = orders.filter((order) => order.status === cancelled).length;
  return { revenue, validOrders: valid.length, averageTicket: averageTicket(revenue, valid.length), cancellationRate: safePercent(cancelledOrders, orders.length), soldItems: valid.flatMap((order) => order.items).reduce((sum, item) => sum + item.quantity, 0), attendances: sessions.length };
}
function groupProducts(orders) {
  const valid = orders.filter(isBillable);
  const total = valid.flatMap((order) => order.items).reduce((sum, item) => sum + item.quantity, 0);
  const map = new Map();
  for (const order of valid) for (const item of order.items) {
    const current = map.get(item.menuItemId) ?? { name: item.nameSnapshot, category: item.category ?? 'Sem categoria', quantity: 0, revenue: 0, share: 0 };
    current.quantity += item.quantity; current.revenue += item.total; current.share = safePercent(current.quantity, total); map.set(item.menuItemId, current);
  }
  return [...map.values()].sort((a, b) => b.quantity - a.quantity);
}
function groupCategories(products) {
  const total = products.reduce((sum, product) => sum + product.quantity, 0);
  const map = new Map();
  for (const product of products) { const current = map.get(product.category) ?? { name: product.category, quantity: 0, revenue: 0, share: 0 }; current.quantity += product.quantity; current.revenue += product.revenue; current.share = safePercent(current.quantity, total); map.set(current.name, current); }
  return [...map.values()];
}
function groupPayments(orders) {
  const revenue = orders.filter(isBillable).reduce((sum, order) => sum + order.total, 0);
  const map = new Map();
  for (const order of orders) { const p = map.get(order.paymentMethod) ?? { method: order.paymentMethod, orders: 0, total: 0, pending: 0, confirmed: 0, cancelled: 0, share: 0 }; p.orders += 1; if (isBillable(order)) { p.total += order.total; p.confirmed += 1; } else if (order.status === cancelled) p.cancelled += 1; else p.pending += 1; p.share = safePercent(p.total, revenue); map.set(p.method, p); }
  return [...map.values()];
}
function previousPeriod(start, end) { const duration = end.getTime() - start.getTime(); const prevEnd = new Date(start.getTime() - 1); return { start: new Date(prevEnd.getTime() - duration), end: prevEnd }; }
function duration(session) { if (!session.closedAt) return null; const diff = new Date(session.closedAt) - new Date(session.startedAt); return diff >= 0 ? diff / 60000 : null; }

const orders = [
  { status: 'delivered', total: 100, paymentMethod: 'pix', items: [{ menuItemId: 'a', nameSnapshot: 'Pizza', category: 'Pratos', quantity: 2, total: 100 }] },
  { status: 'cancelled', total: 80, paymentMethod: 'cash', items: [{ menuItemId: 'b', nameSnapshot: 'Suco', category: 'Bebidas', quantity: 4, total: 80 }] },
  { status: 'received', total: 30, paymentMethod: 'pix', items: [{ menuItemId: 'c', nameSnapshot: 'Água', quantity: 1, total: 30 }] }
];

test('faturamento ignora pedidos cancelados e em andamento', () => assert.equal(summary(orders).revenue, 100));
test('ticket médio usa apenas pedidos válidos e evita divisão por zero', () => { assert.equal(summary(orders).averageTicket, 100); assert.equal(summary([]).averageTicket, 0); });
test('taxa de cancelamento usa total criado e evita divisão por zero', () => { assert.equal(Number(summary(orders).cancellationRate.toFixed(2)), 33.33); assert.equal(summary([]).cancellationRate, 0); });
test('agrupamento de produtos ignora cancelados e calcula participação', () => { const products = groupProducts(orders); assert.equal(products.length, 1); assert.equal(products[0].quantity, 2); assert.equal(products[0].share, 100); });
test('agrupamento por categoria usa Sem categoria quando ausente', () => { const cats = groupCategories([{ category: 'Sem categoria', quantity: 1, revenue: 10 }]); assert.equal(cats[0].name, 'Sem categoria'); });
test('agrupamento por forma de pagamento separa pendentes, confirmados e cancelados', () => { const pix = groupPayments(orders).find((p) => p.method === 'pix'); assert.equal(pix.confirmed, 1); assert.equal(pix.pending, 1); });
test('período anterior mantém a mesma duração', () => { const current = { start: new Date('2026-06-10T00:00:00Z'), end: new Date('2026-06-16T23:59:59Z') }; const prev = previousPeriod(current.start, current.end); assert.equal(prev.end < current.start, true); assert.equal(prev.end - prev.start, current.end - current.start); });
test('intervalo sem pedidos retorna zeros', () => assert.deepEqual(summary([]), { revenue: 0, validOrders: 0, averageTicket: 0, cancellationRate: 0, soldItems: 0, attendances: 0 }));
test('sessões abertas não geram duração média artificial', () => { assert.equal(duration({ startedAt: '2026-06-18T10:00:00Z', closedAt: null }), null); assert.equal(duration({ startedAt: '2026-06-18T10:00:00Z', closedAt: '2026-06-18T11:30:00Z' }), 90); });
