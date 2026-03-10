import { AppPageHeader, AppSectionCard, AppSkeleton, AppStatCard } from "@/components/ui/app-design-system";

export default function RelatoriosPage(): JSX.Element {
  return (
    <section className="space-y-4">
      <AppPageHeader
        eyebrow="Relatórios"
        title="Métricas e inteligência diária"
        description="Estrutura pronta para evolução de análise financeira, desempenho operacional e comparativos por período."
      />
      <div className="grid gap-3 md:grid-cols-3">
        <AppStatCard label="Faturamento" value="R$ 12.480" />
        <AppStatCard label="Pedidos" value="198" />
        <AppStatCard label="Cancelamentos" value="4" />
      </div>
      <AppSectionCard title="Visualizações" description="Área reservada para gráficos de evolução e distribuição.">
        <AppSkeleton className="h-56" />
      </AppSectionCard>
    </section>
  );
}
