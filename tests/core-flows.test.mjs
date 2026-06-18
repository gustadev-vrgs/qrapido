import assert from 'node:assert/strict';
import test from 'node:test';

function calculateCart(items) {
  return Math.round(items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100;
}

function canCreateOrder({ session, table, items, accessGranted }) {
  if (!table?.isActive || table.status !== 'active') return { ok: false, reason: 'mesa_inativa' };
  if (!session || session.status !== 'active') return { ok: false, reason: 'sessao_encerrada' };
  if (!accessGranted) return { ok: false, reason: 'sessao_expirada' };
  if ((session.completedOrdersCount ?? 0) >= (session.maxOrdersAllowed ?? 1)) return { ok: false, reason: 'limite_de_pedidos' };
  if (items.some((item) => !item.isActive || !item.isAvailable)) return { ok: false, reason: 'item_indisponivel' };
  return { ok: true };
}

function nextStatus(current, action) {
  const transitions = {
    received: ['confirmed', 'cancelled'],
    confirmed: ['in_preparation', 'cancelled'],
    in_preparation: ['ready', 'cancelled'],
    ready: ['delivered', 'cancelled'],
    delivered: [],
    cancelled: []
  };
  return transitions[current]?.includes(action) ? action : current;
}

function canAccessAdminRoute(auth) {
  return Boolean(auth?.isAuthenticated && auth?.staffUser?.isActive && ['admin', 'manager', 'attendant', 'kitchen'].includes(auth.staffUser.role));
}

test('acesso a mesa válida permite cardápio público sem login', () => {
  const result = canCreateOrder({
    table: { isActive: true, status: 'active' },
    session: { status: 'active', completedOrdersCount: 0, maxOrdersAllowed: 2 },
    accessGranted: true,
    items: [{ isActive: true, isAvailable: true }]
  });
  assert.deepEqual(result, { ok: true });
});

test('bloqueio de mesa sem sessão ativa', () => {
  const result = canCreateOrder({ table: { isActive: true, status: 'active' }, session: null, accessGranted: true, items: [] });
  assert.equal(result.reason, 'sessao_encerrada');
});

test('cálculo do carrinho usa preço e quantidade reais', () => {
  assert.equal(calculateCart([{ price: 12.9, quantity: 2 }, { price: 5, quantity: 1 }]), 30.8);
});

test('criação de pedido respeita limite de pedidos da sessão', () => {
  const result = canCreateOrder({
    table: { isActive: true, status: 'active' },
    session: { status: 'active', completedOrdersCount: 2, maxOrdersAllowed: 2 },
    accessGranted: true,
    items: [{ isActive: true, isAvailable: true }]
  });
  assert.equal(result.reason, 'limite_de_pedidos');
});

test('alteração de status e cancelamento respeitam transições permitidas', () => {
  assert.equal(nextStatus('received', 'confirmed'), 'confirmed');
  assert.equal(nextStatus('confirmed', 'cancelled'), 'cancelled');
  assert.equal(nextStatus('delivered', 'cancelled'), 'delivered');
});

test('proteção de rota administrativa exige staff ativo e função permitida', () => {
  assert.equal(canAccessAdminRoute({ isAuthenticated: true, staffUser: { isActive: true, role: 'admin' } }), true);
  assert.equal(canAccessAdminRoute({ isAuthenticated: true, staffUser: { isActive: false, role: 'admin' } }), false);
  assert.equal(canAccessAdminRoute({ isAuthenticated: false, staffUser: null }), false);
});
