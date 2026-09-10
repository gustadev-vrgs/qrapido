"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, ChefHat, RotateCcw, Timer, Users } from "lucide-react";

import {
  AppDataCard,
  AppActionButton,
  AppEmptyState,
  AppFilterBar,
  AppSectionCard,
  AppSkeleton,
  AppStatCard,
  AppStatusBadge,
  AppSurface
} from "@/components/ui/app-design-system";
import { ReportsService } from "@/lib/data/services/reports-service";
import { OrdersService } from "@/lib/data/services/orders-service";
import { TablesService } from "@/lib/data/services/tables-service";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import type { DailyMetric, Order, Table, WaiterCall } from "@/lib/types/domain";
import { formatCurrency, formatDateTime } from "@/lib/utils/formatters";
import { calculateSummary } from "@/lib/utils/report-calculations";

const ORDER_STATUS_LABEL: Record<Order["status"], string> = {
  received: "Recebido",
  confirmed: "Confirmado",
  in_preparation: "Em preparo",
  ready: "Pronto",
  delivered: "Entregue",
  cancelled: "Cancelado"
};

export default function DashboardPage(): JSX.Element {
  const { user, firebaseUser } = useAdminAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [metrics, setMetrics] = useState<DailyMetric[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [waiterCalls, setWaiterCalls] = useState<WaiterCall[]>([]);

  const reportsService = useMemo(() => new ReportsService({ scope: "admin" }), []);
  const ordersService = useMemo(() => new OrdersService({ scope: "admin" }), []);
  const tablesService = useMemo(() => new TablesService({ scope: "admin" }), []);

  useEffect(() => {
    const load = async () => {
      if (!user?.restaurantId) return;

      setIsLoading(true);
      try {
        const [metricsData, ordersData, tablesData] = await Promise.all([
          reportsService.listDailyMetrics(user.restaurantId),
          ordersService.listByRestaurant(user.restaurantId),
          tablesService.listByRestaurant(user.restaurantId)
        ]);
        setMetrics(metricsData);
        setOrders(ordersData);
        setTables(tablesData);
      } catch {
        setMetrics([]);
        setOrders([]);
        setTables([]);
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [ordersService, reportsService, tablesService, user?.restaurantId]);

  useEffect(() => {
    if (!firebaseUser || !user || user.role === "kitchen") return;
    let active = true;
    const loadCalls = async () => {
      try {
        const token = await firebaseUser.getIdToken();
        const response = await fetch("/api/admin/waiter-calls", { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
        const payload = await response.json();
        if (active && response.ok) setWaiterCalls(payload.calls ?? []);
      } catch { /* polling retries automatically */ }
    };
    void loadCalls();
    const interval = window.setInterval(() => void loadCalls(), 10_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [firebaseUser, user]);

  const updateCall = async (callId: string, action: "attend" | "complete") => {
    if (!firebaseUser) return;
    const response = await fetch("/api/admin/waiter-calls", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await firebaseUser.getIdToken()}` }, body: JSON.stringify({ callId, action }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Não foi possível atualizar o chamado.");
    setWaiterCalls((current) => current.map((call) => call.id === callId ? { ...call, status: payload.status, updatedAt: new Date().toISOString() } : call));
  };

  const todayMetric = metrics[0];
  const dashboardSummary = calculateSummary(orders, []);
  const totalOrders = todayMetric?.totalOrders ?? dashboardSummary.validOrders;
  const totalRevenue = todayMetric?.totalRevenue ?? dashboardSummary.revenue;
  const cancelledOrders = todayMetric?.cancelledOrders ?? dashboardSummary.cancelledOrders;
  const averageTicket = todayMetric?.averageTicket ?? dashboardSummary.averageTicket;
  const avgPrepMinutes = todayMetric?.averagePreparationMinutes ?? 0;
  const occupiedTables = tables.filter((table) => table.status === "active" || table.status === "awaiting_payment").length;

  const statusSummary = useMemo(() => {
    return orders.reduce<Record<Order["status"], number>>(
      (acc, order) => {
        acc[order.status] += 1;
        return acc;
      },
      {
        received: 0,
        confirmed: 0,
        in_preparation: 0,
        ready: 0,
        delivered: 0,
        cancelled: 0
      }
    );
  }, [orders]);

  const hasDashboardData = metrics.length > 0 || orders.length > 0 || tables.length > 0;

  return (
    <section className="space-y-4">
      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => <AppSkeleton key={index} className="h-28" />)}
        </div>
      ) : !hasDashboardData ? (
        <AppEmptyState
          title="Dashboard sem dados ainda"
          description="Ainda não há movimentações registradas. Assim que pedidos, mesas e métricas forem criados no sistema, este painel exibirá os indicadores reais."
        />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <AppStatCard label="KPIs do dia" value={`${totalOrders} pedidos`} trend="Visão consolidada da operação" />
            <AppStatCard label="Faturamento" value={formatCurrency(totalRevenue)} trend="Receita bruta do período" />
            <AppStatCard label="Ticket médio" value={formatCurrency(averageTicket)} trend="Valor médio por pedido" />
            <AppStatCard label="Tempo médio de preparo" value={`${avgPrepMinutes.toFixed(1)} min`} trend="Produção da cozinha" />
            <AppStatCard label="Mesas ocupadas" value={`${occupiedTables}/${tables.length || 0}`} trend="Ativas + aguardando pagamento" />
            <AppStatCard label="Cancelamentos" value={`${cancelledOrders}`} trend={`${((cancelledOrders / Math.max(totalOrders, 1)) * 100).toFixed(1)}% do total`} />
            <AppStatCard label="Pedidos em fila" value={`${statusSummary.received + statusSummary.confirmed + statusSummary.in_preparation}`} trend="Aguardando finalização" />
            <AppStatCard label="Pedidos prontos" value={`${statusSummary.ready}`} trend="Prontos para entrega" />
          </div>

          <AppFilterBar>
            <AppStatusBadge tone="info">Painel do turno atual</AppStatusBadge>
            <AppStatusBadge tone={cancelledOrders > 4 ? "warning" : "success"}>{cancelledOrders > 4 ? "Atenção em cancelamentos" : "Operação estável"}</AppStatusBadge>
          </AppFilterBar>

          <div className="grid gap-4 xl:grid-cols-2">
            {user && user.role !== "kitchen" ? <AppSectionCard title="Chamados de garçom" description="Fila atualizada automaticamente a cada 10 segundos.">
              <div className="space-y-2">
                {waiterCalls.filter((call) => call.status !== "completed").length === 0 ? <p className="text-sm text-[hsl(var(--foreground-muted))]">Nenhum chamado aberto.</p> : waiterCalls.filter((call) => call.status !== "completed").map((call) => <AppSurface key={call.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><strong className="flex items-center gap-2"><BellRing className="h-4 w-4" />Mesa {call.tableNumber}</strong><p className="text-sm">{call.reason}</p><p className="text-xs text-[hsl(var(--foreground-muted))]">{formatDateTime(call.createdAt)} • {call.status === "pending" ? "Pendente" : "Em atendimento"}</p></div>
                  <AppActionButton onClick={() => void updateCall(call.id, call.status === "pending" ? "attend" : "complete")}>{call.status === "pending" ? "Atender" : "Concluir"}</AppActionButton>
                </AppSurface>)}
              </div>
            </AppSectionCard> : null}
            <AppSectionCard title="Pedidos por status" description="Distribuição operacional em tempo real.">
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(statusSummary).map(([status, amount]) => (
                  <AppDataCard
                    key={status}
                    title={ORDER_STATUS_LABEL[status as Order["status"]]}
                    metadata={`${amount} pedido(s)`}
                    status={<AppStatusBadge tone={status === "cancelled" ? "danger" : "info"}>{((amount / Math.max(totalOrders, 1)) * 100).toFixed(0)}%</AppStatusBadge>}
                  >
                    <p className="text-xs text-[hsl(var(--foreground-muted))]">Acompanhe volume para balancear equipe.</p>
                  </AppDataCard>
                ))}
              </div>
            </AppSectionCard>

            <AppSectionCard title="Visão geral operacional" description="Indicadores chave para decisão rápida.">
              <div className="space-y-2">
                <AppSurface className="flex items-center justify-between p-3">
                  <span className="flex items-center gap-2 text-sm"><ChefHat className="h-4 w-4" /> Produção em andamento</span>
                  <strong>{statusSummary.in_preparation + statusSummary.confirmed} pedidos</strong>
                </AppSurface>
                <AppSurface className="flex items-center justify-between p-3">
                  <span className="flex items-center gap-2 text-sm"><Users className="h-4 w-4" /> Ocupação de salão</span>
                  <strong>{occupiedTables} mesas</strong>
                </AppSurface>
                <AppSurface className="flex items-center justify-between p-3">
                  <span className="flex items-center gap-2 text-sm"><Timer className="h-4 w-4" /> SLA médio de preparo</span>
                  <strong>{avgPrepMinutes.toFixed(1)} min</strong>
                </AppSurface>
                <AppSurface className="flex items-center justify-between p-3">
                  <span className="flex items-center gap-2 text-sm"><RotateCcw className="h-4 w-4" /> Taxa de cancelamento</span>
                  <strong>{((cancelledOrders / Math.max(totalOrders, 1)) * 100).toFixed(1)}%</strong>
                </AppSurface>
              </div>
            </AppSectionCard>
          </div>
        </>
      )}
    </section>
  );
}
