import { AppEmptyState, AppPageHeader, AppSectionCard } from "@/components/ui/app-design-system";

export default function CardapioPage(): JSX.Element {
  return (
    <section className="space-y-4">
      <AppPageHeader
        eyebrow="Cardápio"
        title="Gestão de categorias e itens"
        description="Base visual para CRUD de categorias e itens com regras de disponibilidade e consistência operacional."
      />
      <AppSectionCard title="Catálogo" description="Padrões de listagem, filtro e edição foram iniciados.">
        <AppEmptyState
          title="Nenhum item cadastrado neste ambiente"
          description="Ao integrar com dados reais, as categorias e os produtos serão renderizados com cards reutilizáveis e filtros semânticos."
        />
      </AppSectionCard>
    </section>
  );
}
