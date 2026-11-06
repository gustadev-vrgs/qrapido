"use client";

import { useMemo, useState } from "react";
import { KeyRound, Loader2, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";

import { CodeDialog } from "@/components/tables/table-dialogs";
import { AppActionButton, AppSurface } from "@/components/ui/app-design-system";
import { useAdminApi } from "@/lib/hooks/use-admin-api";
import type { Order, Table, TableSession } from "@/lib/types/domain";
import { describeOrderItem } from "@/lib/utils/menu-options";
import { formatCurrency } from "@/lib/utils/formatters";
import { isGuessingCode, needsReview, riskText } from "@/lib/utils/risk";
import { appToast } from "@/lib/utils/toast";

/** Inline warning on a kitchen ticket: confirm with the table before cooking. */
export function RiskBanner({ order }: { order: Order }): JSX.Element | null {
  const api = useAdminApi();
  const [busy, setBusy] = useState(false);
  if (!needsReview(order)) return null;
  const confirm = async () => {
    setBusy(true);
    try { await api("/api/admin/order/review", { orderId: order.id }); appToast.success(`Mesa ${order.tableNumber} confirmou o pedido`); }
    catch (failure) { appToast.error("Não foi possível confirmar", failure instanceof Error ? failure.message : "Tente novamente."); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 rounded-lg border-2 border-[hsl(var(--danger))] bg-[hsl(var(--danger)/0.08)] p-3" role="alert">
      <p className="flex items-start gap-2 text-sm font-semibold text-[hsl(var(--danger))]"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />Pedido fora do comum ({riskText(order)}). Confirme com a mesa antes de preparar.</p>
      <AppActionButton variant="secondary" className="h-9 gap-1.5" disabled={busy} onClick={() => void confirm()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Mesa confirmou</AppActionButton>
    </div>
  );
}

interface Cart { key: string; tableNumber: number; orders: Order[]; total: number }

/**
 * Top of the waiter screen: carts to confirm with the table and tables where someone
 * keeps typing wrong codes. Both are rare; when there is nothing, nothing is shown.
 */
export function SecurityAlerts({ orders, tables, sessionByTable }: { orders: Order[]; tables: Table[]; sessionByTable: Record<string, TableSession> }): JSX.Element | null {
  const api = useAdminApi();
  const [busy, setBusy] = useState<string | null>(null);
  const [code, setCode] = useState<{ table: Table; code: string } | null>(null);

  const carts = useMemo(() => {
    const groups = new Map<string, Cart>();
    orders.filter(needsReview).forEach((order) => {
      const key = `${order.sessionId}:${order.groupCode ?? order.id}`;
      const cart = groups.get(key) ?? { key, tableNumber: order.tableNumber, orders: [], total: 0 };
      cart.orders.push(order);
      cart.total += order.total;
      groups.set(key, cart);
    });
    return [...groups.values()];
  }, [orders]);
  const guessing = tables.filter((table) => !table.archivedAt && isGuessingCode(sessionByTable[table.id]));

  if (!carts.length && !guessing.length && !code) return null;

  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key);
    try { await action(); appToast.success(success); }
    catch (failure) { appToast.error("Não foi possível concluir", failure instanceof Error ? failure.message : "Tente novamente."); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-2">
      {carts.map((cart) => (
        <AppSurface key={cart.key} className="space-y-2 border-[hsl(var(--danger)/0.55)] bg-[hsl(var(--danger)/0.05)] p-3">
          <p className="flex items-start gap-2"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--danger))]" /><span><strong>Conferir com a Mesa {cart.tableNumber}</strong> · {riskText(cart.orders[0])}<span className="block text-sm text-[hsl(var(--foreground-muted))]">{cart.orders.flatMap((order) => order.items.map(describeOrderItem)).join(", ")} · <span className="num">{formatCurrency(cart.total)}</span></span></span></p>
          <div className="flex flex-wrap gap-2">
            <AppActionButton className="gap-1.5" disabled={busy === cart.key} onClick={() => void run(cart.key, () => api("/api/admin/order/review", { orderId: cart.orders[0].id }), `Mesa ${cart.tableNumber} confirmou`)}>{busy === cart.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Mesa confirmou</AppActionButton>
            <AppActionButton variant="destructive" className="gap-1.5" disabled={busy === cart.key} onClick={() => void run(cart.key, () => Promise.all(cart.orders.map((order) => api("/api/admin/order/transition", { orderId: order.id, nextStatus: "cancelled", reason: "Pedido não confirmado pela mesa" }))), "Pedido cancelado")}><XCircle className="h-4 w-4" />Mesa não pediu</AppActionButton>
          </div>
        </AppSurface>
      ))}
      {guessing.map((table) => (
        <AppSurface key={table.id} className="flex flex-wrap items-center gap-3 border-[hsl(var(--warning)/0.6)] bg-[hsl(var(--gema)/0.12)] p-3">
          <KeyRound className="h-5 w-5 shrink-0 text-[hsl(var(--warning))]" />
          <p className="min-w-0 flex-1 text-sm"><strong>{table.label}:</strong> {sessionByTable[table.id]?.accessFailedAttempts} códigos errados digitados. Alguém pode estar tentando adivinhar. Gere um código novo e passe só para quem está na mesa.</p>
          <AppActionButton className="gap-1.5" disabled={busy === table.id} onClick={() => void run(table.id, async () => { const result = await api<{ attendanceCode: string }>("/api/admin/table/code", { tableId: table.id }); setCode({ table, code: result.attendanceCode }); }, "Código novo gerado")}>{busy === table.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Gerar código novo</AppActionButton>
        </AppSurface>
      ))}
      {code ? <CodeDialog table={code.table} code={code.code} onClose={() => setCode(null)} /> : null}
    </div>
  );
}
