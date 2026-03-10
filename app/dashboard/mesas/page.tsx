import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/shared/page-header";

export default function MesasPage(): JSX.Element {
  return (
    <div>
      <PageHeader title="Mesas" description="Visualize ocupação e status de atendimento por mesa." />
      <EmptyState title="Nenhuma mesa cadastrada" description="Configure as mesas para começar a operar com QRápido." />
    </div>
  );
}
