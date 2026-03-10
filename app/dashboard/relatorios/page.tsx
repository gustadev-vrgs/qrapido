import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/shared/page-header";

export default function RelatoriosPage(): JSX.Element {
  return (
    <div>
      <PageHeader title="Relatórios" description="Acompanhe performance de vendas e operação." />
      <EmptyState title="Sem dados suficientes" description="Os relatórios serão preenchidos automaticamente conforme o uso." />
    </div>
  );
}
