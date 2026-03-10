import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/services/format";
import { listMetrics } from "@/lib/services/repositories";

export default async function ReportsPage(): Promise<JSX.Element> {
  const data = await listMetrics();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Métricas Diárias</h1>
      <Card>
        <ul className="space-y-2 text-sm">
          {data.map((item) => (
            <li key={item.id} className="flex justify-between border-b border-white/10 pb-2">
              <span>{item.day}</span>
              <span>{formatCurrency(item.revenueInCents)} · {item.orderCount} pedidos · {item.occupancyRate}% ocupação</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
