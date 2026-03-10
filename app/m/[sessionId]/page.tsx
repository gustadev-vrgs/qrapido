import { notFound } from "next/navigation";
import { CustomerMenu } from "@/components/customer/customer-menu";
import { Card } from "@/components/ui/card";
import { sessions, tables } from "@/lib/mocks/data";
import { isSessionValid } from "@/lib/services/security";

export default function CustomerSessionPage({ params }: { params: { sessionId: string } }): JSX.Element {
  const session = sessions.find((item) => item.id === params.sessionId);
  if (!session || !isSessionValid(session.expiresAt)) {
    notFound();
  }
  const table = tables.find((item) => item.id === session.tableId);
  if (!table || (table.status !== "active" && table.status !== "occupied")) {
    notFound();
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-md space-y-4 bg-graphite-950 px-4 py-6">
      <Card>
        <h1 className="text-xl font-semibold">QRápido · {table.number}</h1>
        <p className="text-sm text-graphite-300">Sessão temporária ativa. Sem cadastro e sem login.</p>
      </Card>
      <CustomerMenu sessionId={session.id} />
    </div>
  );
}
