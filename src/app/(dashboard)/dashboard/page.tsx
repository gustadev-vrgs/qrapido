"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Armchair, BellRing, Check, ChefHat, HandPlatter, Loader2, ReceiptText, Wallet, WalletCards } from "lucide-react";

import { AppActionButton, AppEmptyState, AppSectionCard, AppSkeleton, AppStatCard, AppSurface } from "@/components/ui/app-design-system";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import { useLiveOrders } from "@/lib/hooks/use-live-orders";
import { isSessionExpired, useLiveTables } from "@/lib/hooks/use-live-tables";
import { useWaiterCalls, waiterReasonLabel } from "@/lib/hooks/use-waiter-calls";
import { formatCurrency, formatTime } from "@/lib/utils/formatters";
import { appToast } from "@/lib/utils/toast";

export default function DashboardPage(): JSX.Element {
  const { user } = useAdminAuth();
  const router = useRouter();
  const { orders, loading, error, dateKey } = useLiveOrders(user?.restaurantId);
  const { tables, sessionByTable } = useLiveTables(user?.restaurantId);
  const canSeeCalls = Boolean(user && user.role !== "kitchen");
  const { calls, error: callsError, resolve } = useWaiterCalls(canSeeCalls);
  const [resolving, setResolving] = useState<string | null>(null);

  // The kitchen only needs its queue.
  useEffect(() => { if (user?.role === "kitchen") router.replace("/dashboard/cozinha"); }, [router, user?.role]);

  const today = useMemo(() => {
    const todays = orders.filter((order) => order.dateKey === dateKey);
    const valid = todays.filter((order) => order.status !== "cancelled");
    // Sales = every order not cancelled (open tables included); a cart split into
    // kitchen + drinks counts once for the average ticket.
    const revenue = valid.reduce((sum, order) => sum + order.total, 0);
    const carts = new Set(valid.map((order) => `${order.sessionId}:${order.groupCode ?? order.id}`)).size;
    return {
      count: carts,
      cancelled: todays.length - valid.length,
      revenue,
      ticket: carts ? revenue / carts : 0,
      preparing: orders.filter((order) => ["received", "confirmed", "in_preparation"].includes(order.status)).length,
      ready: orders.filter((order) => order.status === "ready").length
    };
  }, [orders, dateKey]);
  const occupied = tables.filter((table) => sessionByTable[table.id] && !isSessionExpired(sessionByTable[table.id])).length;
  const people = tables.reduce((sum, table) => sum + (sessionByTable[table.id] && !isSessionExpired(sessionByTable[table.id]) ? sessionByTable[table.id].peopleCount : 0), 0);

  const resolveCall = async (id: string) => {
    const call = calls.find((item) => item.id === id);
    if (!call) return;
    setResolving(id);
    try { await resolve(call); } catch (failure) { appToast.error("Chamado não atualizado", failure instanceof Error ? failure.message : "Tente novamente."); } finally { setResolving(null); }
  };

  return (
    <section className="space-y-4">
      {error ? <AppSurface className="flex items-start gap-3 border-[hsl(var(--danger)/0.5)] p-4 text-sm"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--danger))]" /><p>{error} <Link className="underline" href="/dashboard/diagnostico">Abrir diagnóstico</Link></p></AppSurface> : null}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <AppSkeleton key={index} className="h-28" />)}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <AppStatCard icon={ReceiptText} tone="warning" label="Pedidos hoje" value={String(today.count)} trend={today.cancelled ? `${today.cancelled} cancelado(s)` : "Nenhum cancelamento"} />
          <AppStatCard icon={Wallet} tone="success" label="Vendas hoje" value={formatCurrency(today.revenue)} trend="Pedidos não cancelados" />
          <AppStatCard icon={WalletCards} tone="primary" label="Ticket médio" value={formatCurrency(today.ticket)} trend="Por pedido" />
          <AppStatCard icon={Armchair} tone="info" label="Mesas ocupadas" value={`${occupied}/${tables.filter((table) => !table.archivedAt).length}`} trend={`${people} pessoa(s) no salão`} />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <AppSectionCard icon={ChefHat} tone="warning" title="Agora" description="Toque para abrir a tela de cada um.">
          <div className="grid grid-cols-2 gap-3">
            <Link href="/dashboard/cozinha" className="rounded-[var(--radius-md)] bg-[hsl(var(--gema)/0.16)] p-4 transition-colors hover:bg-[hsl(var(--gema)/0.26)]"><p className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--warning))]"><ChefHat className="h-4 w-4" />Na cozinha</p><p className="num mt-1 text-4xl font-bold">{today.preparing}</p></Link>
            {canSeeCalls ? <Link href="/dashboard/salao" className="rounded-[var(--radius-md)] bg-[hsl(var(--success)/0.12)] p-4 transition-colors hover:bg-[hsl(var(--success)/0.2)]"><p className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--success))]"><HandPlatter className="h-4 w-4" />Para levar</p><p className="num mt-1 text-4xl font-bold">{today.ready}</p></Link> : null}
          </div>
        </AppSectionCard>

        {canSeeCalls ? (
          <AppSectionCard icon={BellRing} tone="danger" title="Chamados de garçom" description="Atualiza sozinho a cada poucos segundos.">
            {callsError ? <p className="mb-2 text-sm text-[hsl(var(--danger))]">{callsError}</p> : null}
            <div className="space-y-2">
              {calls.length === 0 ? <AppEmptyState icon={BellRing} title="Nenhum chamado aberto" description="Quando um cliente chamar pelo celular, aparece aqui e na tela Salão." /> : calls.map((call) => (
                <AppSurface key={call.id} className="flex items-center justify-between gap-3 border-[hsl(var(--danger)/0.5)] bg-[hsl(var(--danger)/0.06)] p-3">
                  <div><strong className="flex items-center gap-2"><BellRing className="h-4 w-4" />Mesa {call.tableNumber}</strong><p className="text-sm">{waiterReasonLabel(call.reason)}</p><p className="text-xs text-[hsl(var(--foreground-muted))]">{formatTime(call.createdAt)}</p></div>
                  <AppActionButton className="gap-2" disabled={resolving === call.id} onClick={() => void resolveCall(call.id)}>{resolving === call.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Resolvido</AppActionButton>
                </AppSurface>
              ))}
            </div>
          </AppSectionCard>
        ) : null}
      </div>
    </section>
  );
}
