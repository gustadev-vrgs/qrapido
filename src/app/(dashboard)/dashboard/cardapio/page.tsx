import { AppEmptyState, AppSectionCard } from "@/components/ui/app-design-system";

export default function CardapioPage(): JSX.Element {
  return (
    <section className="space-y-4">
      <AppSectionCard title="Catálogo" description="Padrões de listagem, filtro e edição foram iniciados.">
        <AppEmptyState
          title="Nenhum item cadastrado neste ambiente"
          description="Ao integrar com dados reais, categorias e produtos serão renderizados com cards reutilizáveis e filtros semânticos."
        />
      </AppSectionCard>
    </section>
  );
}
