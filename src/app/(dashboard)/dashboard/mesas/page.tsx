import { AppDataCard, AppEmptyState, AppSectionCard, AppStatusBadge } from "@/components/ui/app-design-system";

export default function MesasPage(): JSX.Element {
  return (
    <section className="space-y-4">
      <AppSectionCard title="Mapa do salão" description="Cards de mesa serão posicionados nesta área nas próximas etapas.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AppDataCard title="Mesa 04" metadata="Aberta há 32 min" status={<AppStatusBadge tone="success">Ativa</AppStatusBadge>} />
          <AppDataCard title="Mesa 11" metadata="Aguardando abertura" status={<AppStatusBadge tone="neutral">Livre</AppStatusBadge>} />
          <AppDataCard title="Mesa 15" metadata="Solicitou atendimento" status={<AppStatusBadge tone="warning">Atenção</AppStatusBadge>} />
        </div>
      </AppSectionCard>
      <AppEmptyState
        title="Mapa visual em alta fidelidade será carregado aqui"
        description="A disposição real das mesas por setor e garçom será conectada sem mudar a estrutura principal do painel."
      />
    </section>
  );
}
