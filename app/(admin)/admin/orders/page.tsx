import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/services/format";
import { listOrders, listTables } from "@/lib/services/repositories";

export default async function OrdersPage(): Promise<JSX.Element> {
  const [orderList, tableList] = await Promise.all([listOrders(), listTables()]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Pedidos em Tempo Real</h1>
      {orderList.map((order) => {
        const table = tableList.find((item) => item.id === order.tableId);
        return (
          <Card key={order.id}>
            <p className="font-medium">{table?.number ?? "Mesa"} · {order.customerName ?? "Convidado"}</p>
            <p className="text-sm text-graphite-300">Status: {order.status}</p>
            <p className="text-sm text-graphite-300">Total: {formatCurrency(order.totalInCents)}</p>
          </Card>
        );
      })}
    </div>
  );
}
