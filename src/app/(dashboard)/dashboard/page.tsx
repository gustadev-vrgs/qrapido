"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BellRing, ChefHat, Users } from "lucide-react";

import { AppActionButton, AppSectionCard, AppSkeleton, AppStatCard, AppSurface } from "@/components/ui/app-design-system";
import { useAdminApi } from "@/lib/hooks/use-admin-api";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import { useLiveOrders } from "@/lib/hooks/use-live-orders";
import { isSessionExpired, useLiveTables } from "@/lib/hooks/use-live-tables";
import type { WaiterCall } from "@/lib/types/domain";
import { formatCurrency, formatTime } from "@/lib/utils/formatters";
import { appToast } from "@/lib/utils/toast";

export default function DashboardPage(): JSX.Element {
  const { user } = useAdminAuth();
  const api = useAdminApi();
  const { orders, loading, error, dateKey } = useLiveOrders(user?.restaurantId);
  const { tables, sessionByTable } = useLiveTables(user?.restaurantId);
  const [calls, setCalls] = useState<WaiterCall[]>([]);
  const [callsError, setCallsError] = useState<string | null>(null);
  const canSeeCalls = Boolean(user && user.role !== "kitchen");

  const loadCalls = useCallback(async () => {
    try {
      const payload = await api<{ calls: WaiterCall[] }>("/api/admin/waiter-calls");
      setCalls(payload.calls ?? []);
      setCallsError(null);
    } catch (failure) {
      setCallsError(failure instanceof Error ? failure.message : "Não foi possível carregar os chamados.");
    }
  }, [api]);

  useEffect(() => {
    if (!canSeeCalls) return;
    void loadCalls();
    const id = window.setInterval(() => void loadCalls(), 10_000);
    return () => window.clearInterval(id);
  }, [canSeeCalls, loadCalls]);

  const updateCall = async (call: WaiterCall) => {
    try {
      await api("/api/admin/waiter-calls", { callId: call.id, action: call.status === "pending" ? "attend" : "complete" });
      await loadCalls();
    } catch (failure) {
      appToast.error("Chamado não atualizado", failure instanceof Error ? failure.message : "Tente novamente.");
    }
  };

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
  const openCalls = calls.filter((call) => call.status !== "completed");

  return (
    <section className="space-y-4">
      {error ? <AppSurface className="flex items-start gap-3 border border-[hsl(var(--danger)/0.5)] p-4 text-sm"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--danger))]" /><p>{error} <Link className="underline" href="/dashboard/diagnostico">Abrir diagnóstico</Link></p></AppSurface> : null}

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <AppSkeleton key={index} className="h-28" />)}</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <AppStatCard label="Pedidos hoje" value={String(today.count)} trend={today.cancelled ? `${today.cancelled} cancelado(s)` : "Nenhum cancelamento"} />
          <AppStatCard label="Vendas hoje" value={formatCurrency(today.revenue)} trend="Pedidos não cancelados" />
          <AppStatCard label="Ticket médio" value={formatCurrency(today.ticket)} trend="Por pedido" />
          <AppStatCard label="Mesas ocupadas" value={`${occupied}/${tables.filter((table) => !table.archivedAt).length}`} trend={`${people} pessoa(s) no salão`} />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <AppSectionCard title="Agora" description="O que está na cozinha e o que já pode ir para a mesa." action={<Link href="/dashboard/pedidos"><AppActionButton variant="secondary">Abrir pedidos</AppActionButton></Link>}>
          <div className="grid grid-cols-2 gap-3">
            <AppSurface className="p-4"><p className="flex items-center gap-2 text-sm text-[hsl(var(--foreground-muted))]"><ChefHat className="h-4 w-4" />Na cozinha</p><p className="mt-1 text-3xl font-semibold">{today.preparing}</p></AppSurface>
            <AppSurface className="p-4"><p className="flex items-center gap-2 text-sm text-[hsl(var(--foreground-muted))]"><Users className="h-4 w-4" />Para levar</p><p className="mt-1 text-3xl font-semibold">{today.ready}</p></AppSurface>
          </div>
        </AppSectionCard>

        {canSeeCalls ? (
          <AppSectionCard title="Chamados de garçom" description="Atualiza a cada 10 segundos.">
            {callsError ? <p className="text-sm text-[hsl(var(--danger))]">{callsError}</p> : null}
            <div className="space-y-2">
              {openCalls.length === 0 ? <p className="text-sm text-[hsl(var(--foreground-muted))]">Nenhum chamado aberto.</p> : openCalls.map((call) => (
                <AppSurface key={call.id} className="flex items-center justify-between gap-3 p-3">
                  <div><strong className="flex items-center gap-2"><BellRing className="h-4 w-4" />Mesa {call.tableNumber}</strong><p className="text-sm">{call.reason}</p><p className="text-xs text-[hsl(var(--foreground-muted))]">{formatTime(call.createdAt)} · {call.status === "pending" ? "aguardando" : "em atendimento"}</p></div>
                  <AppActionButton onClick={() => void updateCall(call)}>{call.status === "pending" ? "Atender" : "Concluir"}</AppActionButton>
                </AppSurface>
              ))}
            </div>
          </AppSectionCard>
        ) : null}
      </div>
    </section>
  );
}
