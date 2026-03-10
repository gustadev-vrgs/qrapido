import { QrGenerator } from "@/components/admin/qr-generator";
import { sessions, tables } from "@/lib/mocks/data";

export default function QrPage(): JSX.Element {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">QR Code por Mesa</h1>
      <div className="grid gap-4 md:grid-cols-2">
        {sessions.map((session) => {
          const table = tables.find((item) => item.id === session.tableId);
          return (
            <QrGenerator
              key={session.id}
              tableLabel={table?.number ?? "Mesa"}
              sessionPath={`https://qrapido.app/m/${session.id}`}
            />
          );
        })}
      </div>
    </div>
  );
}
