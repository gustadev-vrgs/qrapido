import { AppActionButton, AppDataCard, AppEmptyState, AppFilterBar, AppSectionCard, AppSkeleton, AppStatCard, AppStatusBadge } from "@/components/ui/app-design-system";

export default function DashboardPage(): JSX.Element {
  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <AppStatCard label="Pedidos hoje" value="142" trend="+12% vs. ontem" />
        <AppStatCard label="Ticket médio" value="R$ 68,40" trend="Estável na semana" />
        <AppStatCard label="Tempo médio" value="18min" trend="-2min na última hora" />
      </div>

      <AppFilterBar>
        <AppStatusBadge tone="info">Turno atual</AppStatusBadge>
        <AppStatusBadge tone="success">Operação estável</AppStatusBadge>
        <AppActionButton variant="secondary" className="md:ml-auto">
          Nova ação
        </AppActionButton>
      </AppFilterBar>

      <div className="grid gap-4 xl:grid-cols-2">
        <AppSectionCard title="Filas e distribuição" description="Bloco preparado para os indicadores em tempo real.">
          <div className="space-y-3">
            <AppSkeleton className="h-16" />
            <AppSkeleton className="h-16" />
          </div>
        </AppSectionCard>
        <AppSectionCard title="Alertas prioritários" description="Estados vazios e críticos já padronizados.">
          <AppEmptyState
            title="Nenhum alerta crítico no momento"
            description="Quando houver incidentes operacionais, eles aparecerão aqui com prioridade e ações recomendadas."
          />
        </AppSectionCard>
      </div>

      <AppDataCard title="Última sincronização" metadata="Atualizado há 2 minutos" status={<AppStatusBadge tone="success">Online</AppStatusBadge>}>
        <p className="text-sm text-[hsl(var(--foreground-muted))]">Fluxo de coleta e atualização de métricas está pronto para conexão com dados reais.</p>
      </AppDataCard>
    </section>
  );
}
