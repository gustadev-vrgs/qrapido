"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChefHat, Clock3, DollarSign, Receipt, RotateCcw, Timer, Users } from "lucide-react";

import {
  AppDataCard,
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
import { mockDailyMetrics, mockOrders, mockTables } from "@/lib/mocks/basic";
import type { DailyMetric, Order, Table } from "@/lib/types/domain";
import { formatCurrency } from "@/lib/utils/formatters";

const ORDER_STATUS_LABEL: Record<Order["status"], string> = {
  received: "Recebido",
  confirmed: "Confirmado",
  in_preparation: "Em preparo",
  ready: "Pronto",
  delivered: "Entregue",
  cancelled: "Cancelado"
};

export default function DashboardPage(): JSX.Element {
  const { user } = useAdminAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [metrics, setMetrics] = useState<DailyMetric[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<Table[]>([]);

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
        setMetrics(mockDailyMetrics);
        setOrders(mockOrders);
        setTables(mockTables);
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [ordersService, reportsService, tablesService, user?.restaurantId]);

  const todayMetric = metrics[0];
  const totalOrders = todayMetric?.totalOrders ?? orders.length;
  const totalRevenue = todayMetric?.totalRevenue ?? orders.filter((order) => order.status !== "cancelled").reduce((acc, order) => acc + order.total, 0);
  const cancelledOrders = todayMetric?.cancelledOrders ?? orders.filter((order) => order.status === "cancelled").length;
  const averageTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
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

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, index) => <AppSkeleton key={index} className="h-28" />)
        ) : (
          <>
            <AppStatCard label="KPIs do dia" value={`${totalOrders} pedidos`} trend="Visão consolidada da operação" />
            <AppStatCard label="Faturamento" value={formatCurrency(totalRevenue)} trend="Receita bruta do período" />
            <AppStatCard label="Ticket médio" value={formatCurrency(averageTicket)} trend="Valor médio por pedido" />
            <AppStatCard label="Tempo médio de preparo" value={`${avgPrepMinutes.toFixed(1)} min`} trend="Produção da cozinha" />
            <AppStatCard label="Mesas ocupadas" value={`${occupiedTables}/${tables.length || 0}`} trend="Ativas + aguardando pagamento" />
            <AppStatCard label="Cancelamentos" value={`${cancelledOrders}`} trend={`${((cancelledOrders / Math.max(totalOrders, 1)) * 100).toFixed(1)}% do total`} />
            <AppStatCard label="Pedidos em fila" value={`${statusSummary.received + statusSummary.confirmed + statusSummary.in_preparation}`} trend="Aguardando finalização" />
            <AppStatCard label="Pedidos prontos" value={`${statusSummary.ready}`} trend="Prontos para entrega" />
          </>
        )}
      </div>

      <AppFilterBar>
        <AppStatusBadge tone="info">Painel do turno atual</AppStatusBadge>
        <AppStatusBadge tone={cancelledOrders > 4 ? "warning" : "success"}>{cancelledOrders > 4 ? "Atenção em cancelamentos" : "Operação estável"}</AppStatusBadge>
      </AppFilterBar>

      <div className="grid gap-4 xl:grid-cols-2">
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

      {!isLoading && orders.length === 0 ? (
        <AppEmptyState title="Sem pedidos para hoje" description="Quando houver movimentação, os KPIs e alertas aparecerão automaticamente neste painel." />
      ) : null}

      <AppSectionCard title="Resumo executivo" description="Leitura rápida para gestão de turno.">
        <div className="grid gap-3 md:grid-cols-3">
          <AppDataCard title="Receita por hora (estimada)" metadata={formatCurrency(totalRevenue / 8)} status={<DollarSign className="h-4 w-4" />} />
          <AppDataCard title="Pedidos por colaborador (estimado)" metadata={`${Math.ceil(totalOrders / 5)} / pessoa`} status={<Receipt className="h-4 w-4" />} />
          <AppDataCard title="Risco operacional" metadata={cancelledOrders > 6 ? "Moderado" : "Baixo"} status={cancelledOrders > 6 ? <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" /> : <Clock3 className="h-4 w-4" />} />
        </div>
      </AppSectionCard>
    </section>
  );
}
