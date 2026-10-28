"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Gift, Loader2, Printer, RefreshCw, Wallet } from "lucide-react";

import { AppActionButton, AppSectionCard, AppSurface, AppTextInput } from "@/components/ui/app-design-system";
import { paymentMethodLabels } from "@/lib/constants/status-labels";
import { describeFirebaseError } from "@/lib/data/errors";
import { OrdersService } from "@/lib/data/services/orders-service";
import { SessionsService } from "@/lib/data/services/sessions-service";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import type { TableSession } from "@/lib/types/domain";
import { buildCashClosing, type CashClosing } from "@/lib/utils/cash-closing";
import { toRestaurantDateKey } from "@/lib/utils/date-key";
import { formatCurrency } from "@/lib/utils/formatters";

function formatDay(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
}

/** End-of-day cashier check: what came in per payment method, open bills, courtesies and cancellations. */
export default function CaixaPage(): JSX.Element {
  const { user } = useAdminAuth();
  const [dateKey, setDateKey] = useState(() => toRestaurantDateKey());
  const [closing, setClosing] = useState<CashClosing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user?.restaurantId) return;
    setLoading(true);
    try {
      const sessionsService = new SessionsService();
      const [orders, closedToday] = await Promise.all([
        new OrdersService().listByDateKey(user.restaurantId, dateKey),
        sessionsService.listClosedOn(user.restaurantId, dateKey)
      ]);
      // Bills closed before closedDateKey existed are found through the day's orders.
      const known = new Set(closedToday.map((session) => session.id));
      const others = await sessionsService.getMany(orders.map((order) => order.sessionId).filter((id) => !known.has(id)));
      const sessions: TableSession[] = [...closedToday, ...others];
      const closedOn = (session: TableSession) => (session.closedDateKey ? session.closedDateKey === dateKey : Boolean(session.closedAt) && toRestaurantDateKey(new Date(session.closedAt!)) === dateKey);
      setClosing(buildCashClosing(dateKey, orders, sessions, closedOn));
      setError(null);
    } catch (failure) {
      setError(describeFirebaseError(failure));
    } finally {
      setLoading(false);
    }
  }, [dateKey, user?.restaurantId]);

  useEffect(() => { void load(); }, [load]);

  const today = toRestaurantDateKey();
  const generatedAt = useMemo(() => new Date().toLocaleString("pt-BR"), [closing]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="space-y-4">
      <AppSurface className="flex flex-wrap items-end gap-3 p-4 print:hidden">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Dia</span>
          <AppTextInput type="date" value={dateKey} max={today} onChange={(event) => event.target.value && setDateKey(event.target.value)} />
        </label>
        <AppActionButton variant="secondary" className="gap-2" disabled={loading} onClick={() => void load()}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Atualizar</AppActionButton>
        <AppActionButton className="ml-auto gap-2" disabled={!closing} onClick={() => window.print()}><Printer className="h-4 w-4" />Imprimir</AppActionButton>
      </AppSurface>

      {error ? <AppSurface className="p-4 text-sm text-[hsl(var(--danger))]">{error}</AppSurface> : null}

      {closing ? (
        <>
          <div className="hidden print:block">
            <p className="text-xl font-bold">Fechamento de caixa</p>
            <p className="capitalize">{formatDay(closing.dateKey)}</p>
          </div>

          <AppSectionCard title="Recebido no caixa" description={`${formatDay(closing.dateKey)} · ${closing.closedBills} ${closing.closedBills === 1 ? "conta fechada" : "contas fechadas"}${closing.splitBills ? `, ${closing.splitBills} dividida(s)` : ""}`} icon={Wallet} tone="success">
            {closing.received.length ? (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[hsl(var(--foreground-muted))]"><th className="py-1">Forma</th><th className="py-1 text-right">Contas</th><th className="py-1 text-right">Valor</th></tr></thead>
                <tbody>
                  {closing.received.map((item) => (
                    <tr key={item.method} className="border-t border-[hsl(var(--border))]"><td className="py-2">{paymentMethodLabels[item.method]}</td><td className="num py-2 text-right">{item.bills}</td><td className="num py-2 text-right">{formatCurrency(item.amount)}</td></tr>
                  ))}
                  <tr className="border-t-2 border-[hsl(var(--border-strong))] font-bold"><td className="py-2">Total</td><td /><td className="num py-2 text-right text-lg">{formatCurrency(closing.receivedTotal)}</td></tr>
                </tbody>
              </table>
            ) : <p className="text-sm text-[hsl(var(--foreground-muted))]">Nenhuma conta fechada com pagamento neste dia.</p>}
            {closing.received.some((item) => item.method === "cash") ? <p className="mt-2 text-xs text-[hsl(var(--foreground-muted))]">Dinheiro: o valor é o da conta, sem o troco. É o que deve estar na gaveta, além do fundo de troco.</p> : null}
          </AppSectionCard>

          {closing.openBills.length ? (
            <AppSectionCard title="Mesas ainda abertas" description="Pedidos deste dia que ainda não foram pagos." tone="warning">
              <ul className="space-y-1 text-sm">
                {closing.openBills.map((bill) => <li key={bill.tableNumber} className="flex justify-between"><span>Mesa {bill.tableNumber}</span><span className="num">{formatCurrency(bill.total)}</span></li>)}
                <li className="flex justify-between border-t border-[hsl(var(--border))] pt-1 font-semibold"><span>Em aberto</span><span className="num">{formatCurrency(closing.openTotal)}</span></li>
              </ul>
            </AppSectionCard>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <AppSectionCard title="Cortesias" description="Contas fechadas sem cobrança." icon={Gift} tone="neutral">
              {closing.courtesies.length ? (
                <ul className="space-y-1 text-sm">{closing.courtesies.map((item, index) => <li key={index} className="flex justify-between gap-3"><span>Mesa {item.tableNumber}{item.reason ? ` · ${item.reason}` : ""}</span><span className="num shrink-0">{formatCurrency(item.total)}</span></li>)}</ul>
              ) : <p className="text-sm text-[hsl(var(--foreground-muted))]">Nenhuma.</p>}
            </AppSectionCard>
            <AppSectionCard title="Cancelamentos" description={closing.cancelled.length ? `${closing.cancelled.length} pedido(s), ${formatCurrency(closing.cancelledTotal)}` : "Pedidos cancelados neste dia."} icon={Ban} tone="danger">
              {closing.cancelled.length ? (
                <ul className="space-y-1 text-sm">{closing.cancelled.map((item) => <li key={item.orderCode} className="flex justify-between gap-3"><span>Mesa {item.tableNumber} · <span className="num">{item.orderCode}</span>{item.reason ? ` · ${item.reason}` : ""}</span><span className="num shrink-0">{formatCurrency(item.total)}</span></li>)}</ul>
              ) : <p className="text-sm text-[hsl(var(--foreground-muted))]">Nenhum.</p>}
            </AppSectionCard>
          </div>

          <AppSurface className="grid gap-2 p-4 text-sm sm:grid-cols-2">
            <p>Pedidos do dia (sem cancelados): <strong className="num">{closing.validOrders}</strong></p>
            <p>Valor dos pedidos do dia: <strong className="num">{formatCurrency(closing.ordersTotal)}</strong></p>
            <p className="text-xs text-[hsl(var(--foreground-muted))] sm:col-span-2">O valor dos pedidos pode diferir do recebido: contas de mesas abertas antes da meia-noite, cortesias e mesas ainda abertas entram em dias diferentes.</p>
          </AppSurface>
          <p className="hidden text-center text-xs print:block">Gerado em {generatedAt}. Sistema QRápido.</p>
        </>
      ) : loading ? <AppSurface className="p-4 text-sm text-[hsl(var(--foreground-muted))]">Carregando...</AppSurface> : null}
    </section>
  );
}
