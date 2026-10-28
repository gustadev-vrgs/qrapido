import assert from "node:assert/strict";
import test from "node:test";

import type { Order, TableSession } from "@/lib/types/domain";
import { buildCashClosing } from "@/lib/utils/cash-closing";

const order = (patch: Partial<Order>): Order => ({ id: Math.random().toString(36).slice(2), orderCode: "M1-01-AAAA", tableNumber: 1, sessionId: "s1", status: "delivered", total: 10, paidWith: null, cancellationReason: null, ...patch } as Order);
const session = (patch: Partial<TableSession>): TableSession => ({ id: "s1", tableNumber: 1, status: "closed", closedDateKey: "2026-10-28", payments: [], paidWith: null, billTotal: 0, closeReason: null, ...patch } as TableSession);
const closedOn = (item: TableSession) => item.closedDateKey === "2026-10-28";

test("fechamento soma o recebido por forma, inclusive conta dividida e conta antiga", () => {
  const sessions = [
    session({ id: "s1", tableNumber: 1, billTotal: 50, paidWith: "pix", payments: [{ method: "pix", amount: 30 }, { method: "cash", amount: 20 }] }),
    // Fechada antes da divisão existir: só paidWith + billTotal.
    session({ id: "s2", tableNumber: 2, billTotal: 15.5, paidWith: "debit_card", payments: [] }),
    session({ id: "s3", tableNumber: 3, billTotal: 12, paidWith: null, payments: [], closeReason: "cortesia do dono" }),
    session({ id: "s4", tableNumber: 4, status: "active", closedDateKey: null }),
    session({ id: "s5", tableNumber: 5, billTotal: 99, paidWith: "pix", closedDateKey: "2026-10-27" })
  ];
  const orders = [
    order({ sessionId: "s1", tableNumber: 1, total: 50, paidWith: "pix" }),
    order({ sessionId: "s4", tableNumber: 4, total: 22.4, status: "ready" }),
    order({ sessionId: "s4", tableNumber: 4, total: 8, status: "cancelled", cancellationReason: "acabou o frango", orderCode: "M4-02-BBBB" })
  ];
  const result = buildCashClosing("2026-10-28", orders, sessions, closedOn);

  assert.deepEqual(result.received, [
    { method: "pix", amount: 30, bills: 1 },
    { method: "cash", amount: 20, bills: 1 },
    { method: "debit_card", amount: 15.5, bills: 1 }
  ]);
  assert.equal(result.receivedTotal, 65.5);
  assert.equal(result.closedBills, 3, "a conta fechada em outro dia não entra");
  assert.equal(result.splitBills, 1);
  assert.deepEqual(result.courtesies, [{ tableNumber: 3, total: 12, reason: "cortesia do dono" }]);
  assert.deepEqual(result.openBills, [{ tableNumber: 4, total: 22.4 }]);
  assert.equal(result.cancelled.length, 1);
  assert.equal(result.cancelled[0].reason, "acabou o frango");
  assert.equal(result.validOrders, 2);
});
