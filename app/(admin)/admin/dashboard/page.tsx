import { Card } from "@/components/ui/card";
import { listMetrics, listOrders, listTables } from "@/lib/services/repositories";
import { formatCurrency } from "@/lib/services/format";

export default async function DashboardPage(): Promise<JSX.Element> {
  const [tables, orders, metrics] = await Promise.all([listTables(), listOrders(), listMetrics()]);
  const totalRevenue = metrics.reduce((acc, item) => acc + item.revenueInCents, 0);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Visão Operacional</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <Card><p className="text-sm text-graphite-300">Mesas monitoradas</p><p className="text-2xl">{tables.length}</p></Card>
        <Card><p className="text-sm text-graphite-300">Pedidos ativos</p><p className="text-2xl">{orders.length}</p></Card>
        <Card><p className="text-sm text-graphite-300">Receita da semana</p><p className="text-2xl">{formatCurrency(totalRevenue)}</p></Card>
      </div>
    </div>
  );
}
