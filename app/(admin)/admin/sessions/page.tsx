import { Card } from "@/components/ui/card";
import { listSessions, listTables } from "@/lib/services/repositories";

export default async function SessionsPage(): Promise<JSX.Element> {
  const [sessionList, tableList] = await Promise.all([listSessions(), listTables()]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Sessões por Mesa</h1>
      {sessionList.map((session) => {
        const table = tableList.find((item) => item.id === session.tableId);
        return (
          <Card key={session.id}>
            <p className="font-medium">{table?.number ?? "Mesa"}</p>
            <p className="text-sm text-graphite-300">Cliente: {session.customerName ?? "Não informado"}</p>
            <p className="text-sm text-graphite-300">Expira em: {new Date(session.expiresAt).toLocaleTimeString("pt-BR")}</p>
          </Card>
        );
      })}
    </div>
  );
}
