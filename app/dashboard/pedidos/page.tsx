import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/shared/page-header";

export default function PedidosPage(): JSX.Element {
  return (
    <div>
      <PageHeader title="Pedidos" description="Gerencie os pedidos ativos da casa com eficiência." />
      <EmptyState title="Sem pedidos por enquanto" description="Assim que novos pedidos chegarem, eles aparecerão aqui em tempo real." />
    </div>
  );
}
