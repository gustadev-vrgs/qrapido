import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/shared/page-header";

export default function CardapioPage(): JSX.Element {
  return (
    <div>
      <PageHeader title="Cardápio" description="Organize categorias, itens e disponibilidade." />
      <EmptyState title="Cardápio vazio" description="Adicione pratos e bebidas para liberar o menu digital para os clientes." />
    </div>
  );
}
