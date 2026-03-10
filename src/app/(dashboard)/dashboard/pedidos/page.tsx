import { AppActionButton, AppDataCard, AppFilterBar, AppPageHeader, AppSearchInput, AppStatusBadge } from "@/components/ui/app-design-system";

export default function PedidosPage(): JSX.Element {
  return (
    <section className="space-y-4">
      <AppPageHeader
        eyebrow="Pedidos"
        title="Central de pedidos"
        description="Estrutura para controle de fila, preparação e despacho com leitura clara de prioridade."
        actions={<AppActionButton variant="secondary">Exportar</AppActionButton>}
      />
      <AppFilterBar>
        <AppSearchInput placeholder="Buscar por mesa, cliente ou item" className="flex-1" />
        <AppStatusBadge tone="warning">8 em preparo</AppStatusBadge>
      </AppFilterBar>
      <div className="grid gap-3 md:grid-cols-2">
        <AppDataCard title="Pedidos pendentes" metadata="Atualização contínua" status={<AppStatusBadge tone="info">Fila ativa</AppStatusBadge>} />
        <AppDataCard title="Pedidos finalizados" metadata="Turno atual" status={<AppStatusBadge tone="success">Normal</AppStatusBadge>} />
      </div>
    </section>
  );
}
