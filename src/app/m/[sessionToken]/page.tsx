import {
  AppActionButton,
  AppDataCard,
  AppFormField,
  AppSearchInput,
  AppStatusBadge,
  AppSurface,
  AppTextInput,
  MobileSectionTitle,
  MobileStickyBar
} from "@/components/ui/app-design-system";

interface MobileSessionPageProps {
  params: {
    sessionToken: string;
  };
}

export default function MobileSessionPage({ params }: MobileSessionPageProps): JSX.Element {
  return (
    <main className="min-h-screen p-4 pb-24 text-[hsl(var(--foreground))]">
      <section className="mx-auto flex max-w-md flex-col gap-4">
        <AppSurface variant="strong" className="p-5">
          <MobileSectionTitle
            eyebrow="Experiência do cliente"
            title="Sessão da mesa"
            description="Identidade mobile consistente para pedidos sem login e fluxo rápido de atendimento."
          />
          <div className="mt-4">
            <AppStatusBadge tone="info">Token: {params.sessionToken}</AppStatusBadge>
          </div>
        </AppSurface>

        <AppSearchInput placeholder="Buscar item do cardápio" />

        <AppDataCard title="Mesa 12" metadata="Sessão ativa há 18 min" status={<AppStatusBadge tone="success">Conectado</AppStatusBadge>}>
          <p className="text-sm text-[hsl(var(--foreground-muted))]">O conteúdo final do cardápio será integrado nas próximas etapas com filtros e categorias.</p>
        </AppDataCard>

        <AppSurface className="p-4">
          <AppFormField label="Observações do pedido" hint="Opcional">
            <AppTextInput placeholder="Sem cebola, por favor" />
          </AppFormField>
        </AppSurface>
      </section>

      <MobileStickyBar>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-[hsl(var(--foreground-muted))]">Resumo</p>
            <p className="text-sm font-medium">2 itens · R$ 74,80</p>
          </div>
          <AppActionButton className="min-w-32">Enviar pedido</AppActionButton>
        </div>
      </MobileStickyBar>
    </main>
  );
}
