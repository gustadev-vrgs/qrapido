import { AppEmptyState, AppSectionCard, AppSkeleton, AppStatCard } from "@/components/ui/app-design-system";

export default function RelatoriosPage(): JSX.Element {
  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <AppStatCard label="Faturamento" value="R$ 12.480" />
        <AppStatCard label="Pedidos" value="198" />
        <AppStatCard label="Cancelamentos" value="4" />
      </div>
      <AppSectionCard title="Visualizações" description="Área reservada para gráficos de evolução e distribuição.">
        <AppSkeleton className="h-56" />
      </AppSectionCard>
      <AppEmptyState
        title="Comparativos avançados em construção"
        description="Filtros por período, origem e produto serão liberados em módulos sem alterar o shell administrativo."
      />
    </section>
  );
}
