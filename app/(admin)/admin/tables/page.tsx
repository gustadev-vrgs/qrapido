import { Card } from "@/components/ui/card";
import { listTables } from "@/lib/services/repositories";

export default async function TablesPage(): Promise<JSX.Element> {
  const data = await listTables();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Gestão de Mesas</h1>
      <div className="grid gap-3 md:grid-cols-2">
        {data.map((table) => (
          <Card key={table.id}>
            <p className="font-medium">{table.number}</p>
            <p className="text-sm text-graphite-300">Capacidade: {table.capacity} pessoas</p>
            <p className="text-sm text-graphite-300">Status: {table.status}</p>
            <p className="text-sm text-graphite-300">Sessões ativas: {table.activeSessionCount}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
