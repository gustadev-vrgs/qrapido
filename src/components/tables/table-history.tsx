"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { AppStatusBadge, AppSurface } from "@/components/ui/app-design-system";
import { orderStatusLabels } from "@/lib/constants/status-labels";
import { describeFirebaseError } from "@/lib/data/errors";
import { OrdersService } from "@/lib/data/services/orders-service";
import { SessionsService } from "@/lib/data/services/sessions-service";
import type { Order, Table, TableSession } from "@/lib/types/domain";
import { formatCurrency, formatDateTime, formatTime } from "@/lib/utils/formatters";

const TONE: Record<Order["status"], "info" | "warning" | "success" | "neutral" | "danger"> = { received: "info", confirmed: "info", in_preparation: "warning", ready: "success", delivered: "neutral", cancelled: "danger" };

interface Attendance {
  id: string;
  session: TableSession | null;
  orders: Order[];
  total: number;
  startedAt: string;
}

/** Every attendance of one table (open, closed, archived table included), newest first, with its orders and total. */
export function TableHistory({ table, restaurantId }: { table: Table; restaurantId: string }): JSX.Element {
  const [state, setState] = useState<{ loading: boolean; error: string | null; orders: Order[]; sessions: TableSession[] }>({ loading: true, error: null, orders: [], sessions: [] });

  useEffect(() => {
    let alive = true;
    // Equality-only queries (restaurantId + tableId): no composite index needed.
    Promise.all([new OrdersService().listByTable(restaurantId, table.id), new SessionsService().listByTable(restaurantId, table.id)])
      .then(([orders, sessions]) => { if (alive) setState({ loading: false, error: null, orders, sessions }); })
      .catch((error) => { if (alive) setState({ loading: false, error: describeFirebaseError(error), orders: [], sessions: [] }); });
    return () => { alive = false; };
  }, [restaurantId, table.id]);

  const attendances = useMemo<Attendance[]>(() => {
    const bySession = new Map<string, Attendance>();
    for (const session of state.sessions) bySession.set(session.id, { id: session.id, session, orders: [], total: 0, startedAt: session.startedAt });
    for (const order of state.orders) {
      const entry = bySession.get(order.sessionId) ?? { id: order.sessionId, session: null, orders: [], total: 0, startedAt: order.receivedAt };
      entry.orders.push(order);
      if (order.status !== "cancelled") entry.total += order.total;
      bySession.set(order.sessionId, entry);
    }
    return [...bySession.values()].filter((entry) => entry.orders.length > 0 || entry.session).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }, [state.orders, state.sessions]);

  const grandTotal = attendances.reduce((sum, entry) => sum + entry.total, 0);

  if (state.loading) return <p className="flex items-center gap-2 text-sm text-[hsl(var(--foreground-muted))]"><Loader2 className="h-4 w-4 animate-spin" />Carregando histórico...</p>;
  if (state.error) return <p className="text-sm text-[hsl(var(--danger))]">{state.error}</p>;
  if (!attendances.length) return <p className="text-sm text-[hsl(var(--foreground-muted))]">Esta mesa ainda não teve atendimentos.</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-[hsl(var(--foreground-muted))]">{attendances.length} atendimento(s) · total vendido <strong className="text-[hsl(var(--foreground))]">{formatCurrency(grandTotal)}</strong></p>
      {attendances.map((entry) => (
        <AppSurface key={entry.id} className="space-y-2 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">{formatDateTime(entry.startedAt)}{entry.session?.closedAt ? ` → ${formatTime(entry.session.closedAt)}` : ""}</p>
            <div className="flex items-center gap-2">
              {entry.session ? <AppStatusBadge tone={entry.session.status === "active" ? "info" : "neutral"}>{entry.session.status === "active" ? "Aberto" : "Encerrado"}</AppStatusBadge> : null}
              <strong className="text-sm">{formatCurrency(entry.total)}</strong>
            </div>
          </div>
          {entry.session ? <p className="text-xs text-[hsl(var(--foreground-muted))]">{entry.session.peopleCount} pessoa(s){entry.session.notes ? ` · ${entry.session.notes}` : ""}</p> : null}
          {entry.orders.length === 0 ? <p className="text-xs text-[hsl(var(--foreground-muted))]">Sem pedidos.</p> : (
            <ul className="space-y-1">
              {entry.orders.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)).map((order) => (
                <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[hsl(var(--border))] px-2 py-1.5 text-sm">
                  <span className="min-w-0"><span className="num text-xs">{order.orderCode}</span> · {order.items.map((item) => `${item.quantity}x ${item.nameSnapshot}`).join(", ")}</span>
                  <span className="flex items-center gap-2"><AppStatusBadge tone={TONE[order.status]}>{orderStatusLabels[order.status]}</AppStatusBadge>{formatCurrency(order.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </AppSurface>
      ))}
    </div>
  );
}
