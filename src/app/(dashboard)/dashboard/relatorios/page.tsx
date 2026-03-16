"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { AppDataCard, AppEmptyState, AppFilterBar, AppSectionCard, AppSelect, AppStatCard } from "@/components/ui/app-design-system";
import { OrdersService } from "@/lib/data/services/orders-service";
import { ReportsService } from "@/lib/data/services/reports-service";
import { TablesService } from "@/lib/data/services/tables-service";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import type { DailyMetric, Order, Table } from "@/lib/types/domain";
import { formatCurrency } from "@/lib/utils/formatters";

type PeriodFilter = "7d" | "30d";

export default function RelatoriosPage(): JSX.Element {
  const { user } = useAdminAuth();
  const [period, setPeriod] = useState<PeriodFilter>("7d");
  const [metrics, setMetrics] = useState<DailyMetric[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<Table[]>([]);

  const reportsService = useMemo(() => new ReportsService({ scope: "admin" }), []);
  const ordersService = useMemo(() => new OrdersService({ scope: "admin" }), []);
  const tablesService = useMemo(() => new TablesService({ scope: "admin" }), []);

  useEffect(() => {
    const load = async () => {
      if (!user?.restaurantId) return;
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
      }
    };

    void load();
  }, [ordersService, reportsService, tablesService, user?.restaurantId]);

  const filteredMetrics = useMemo(() => {
    const limit = period === "7d" ? 7 : 30;
    return [...metrics].slice(0, limit).reverse();
  }, [metrics, period]);

  const revenueByPeriod = filteredMetrics.map((metric) => ({
    date: metric.dateKey.slice(5),
    faturamento: Number(metric.totalRevenue.toFixed(2)),
    pedidos: metric.totalOrders
  }));

  const topItems = useMemo(() => {
    const map = new Map<string, { name: string; quantity: number; revenue: number }>();
    filteredMetrics.forEach((metric) => {
      metric.topItems.forEach((item) => {
        const current = map.get(item.menuItemId) ?? { name: item.nameSnapshot, quantity: 0, revenue: 0 };
        current.quantity += item.quantity;
        current.revenue += item.revenue;
        map.set(item.menuItemId, current);
      });
    });

    return Array.from(map.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5)
      .map((item) => ({ item: item.name, quantidade: item.quantity, receita: Number(item.revenue.toFixed(2)) }));
  }, [filteredMetrics]);

  const statusData = useMemo(() => {
    const summary = orders.reduce<Record<Order["status"], number>>(
      (acc, order) => {
        acc[order.status] += 1;
        return acc;
      },
      { received: 0, confirmed: 0, in_preparation: 0, ready: 0, delivered: 0, cancelled: 0 }
    );

    return Object.entries(summary).map(([status, value]) => ({ status, pedidos: value }));
  }, [orders]);

  const cancellationRate = orders.length ? (orders.filter((order) => order.status === "cancelled").length / orders.length) * 100 : 0;
  const occupiedRate = tables.length ? (tables.filter((table) => ["active", "awaiting_payment"].includes(table.status)).length / tables.length) * 100 : 0;
  const hasReportData = filteredMetrics.length > 0 || orders.length > 0;

  return (
    <section className="space-y-4">
      <AppFilterBar>
        <AppDataCard title="Filtros" metadata="Selecione o período dos gráficos.">
          <AppSelect value={period} onChange={(event) => setPeriod(event.target.value as PeriodFilter)} className="max-w-44">
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
          </AppSelect>
        </AppDataCard>
      </AppFilterBar>

      {!hasReportData ? (
        <AppEmptyState
          title="Ainda não há métricas suficientes para exibir relatórios"
          description="Os gráficos e comparativos serão preenchidos automaticamente quando pedidos e métricas reais forem registrados no Firestore."
        />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <AppStatCard label="Faturamento no período" value={formatCurrency(filteredMetrics.reduce((acc, metric) => acc + metric.totalRevenue, 0))} />
            <AppStatCard label="Pedidos por status" value={`${orders.length} pedidos`} trend="Distribuição abaixo" />
            <AppStatCard label="Taxa de cancelamento" value={`${cancellationRate.toFixed(1)}%`} trend="Meta < 5%" />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <AppSectionCard title="Faturamento por período" description="Evolução diária de pedidos e receita.">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueByPeriod}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="faturamento" stroke="#0ea5e9" strokeWidth={2} />
                    <Line type="monotone" dataKey="pedidos" stroke="#22c55e" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </AppSectionCard>

            <AppSectionCard title="Itens mais vendidos" description="Top produtos em volume e receita.">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topItems}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="item" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="quantidade" fill="#6366f1" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </AppSectionCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <AppSectionCard title="Pedidos por status" description="Distribuição da fila de produção.">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="status" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="pedidos" fill="#14b8a6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </AppSectionCard>

            <div className="grid gap-4 md:grid-cols-1">
              <AppDataCard title="Taxa de cancelamento" metadata={`${cancellationRate.toFixed(1)}%`}>Meta recomendada: até 5%.</AppDataCard>
              <AppDataCard title="Ocupação de mesas" metadata={`${occupiedRate.toFixed(1)}%`}>Considera mesas ativas e aguardando pagamento.</AppDataCard>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
