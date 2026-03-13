import { AppActionButton, AppDataCard, AppEmptyState, AppFilterBar, AppSearchInput, AppStatusBadge } from "@/components/ui/app-design-system";

export default function PedidosPage(): JSX.Element {
  return (
    <section className="space-y-4">
      <AppFilterBar>
        <AppSearchInput placeholder="Buscar por mesa, cliente ou item" className="flex-1" />
        <AppStatusBadge tone="warning">8 em preparo</AppStatusBadge>
        <AppActionButton variant="secondary">Exportar</AppActionButton>
      </AppFilterBar>

      <div className="grid gap-3 md:grid-cols-2">
        <AppDataCard title="Pedidos pendentes" metadata="Atualização contínua" status={<AppStatusBadge tone="info">Fila ativa</AppStatusBadge>} />
        <AppDataCard title="Pedidos finalizados" metadata="Turno atual" status={<AppStatusBadge tone="success">Normal</AppStatusBadge>} />
      </div>

      <AppEmptyState
        title="Quadro Kanban de pedidos em preparação"
        description="A experiência completa de arrastar e atualizar etapas será adicionada nas próximas fases sem quebrar o layout atual."
      />
    </section>
  );
}
