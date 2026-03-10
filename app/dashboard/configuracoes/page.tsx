import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/shared/page-header";

export default function ConfiguracoesPage(): JSX.Element {
  return (
    <div>
      <PageHeader title="Configurações" description="Ajuste preferências da operação e integrações." />
      <EmptyState title="Nenhuma configuração avançada" description="Em breve você poderá personalizar todas as opções da sua loja." />
    </div>
  );
}
