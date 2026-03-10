import { AppActionButton, AppFormField, AppPageHeader, AppSectionCard, AppSelect, AppTextInput, AppTextarea } from "@/components/ui/app-design-system";

export default function ConfiguracoesPage(): JSX.Element {
  return (
    <section className="space-y-4">
      <AppPageHeader
        eyebrow="Configurações"
        title="Parâmetros do restaurante"
        description="Componente base de formulário para políticas de operação e preferências institucionais."
      />
      <AppSectionCard title="Preferências gerais" description="Campos com estados padronizados e hierarquia tipográfica consistente.">
        <div className="grid gap-4 md:grid-cols-2">
          <AppFormField label="Nome do restaurante">
            <AppTextInput placeholder="Ex.: Bistrô Central" />
          </AppFormField>
          <AppFormField label="Tipo de serviço">
            <AppSelect defaultValue="salon">
              <option value="salon">Salão + delivery</option>
              <option value="salon-only">Somente salão</option>
              <option value="delivery">Somente delivery</option>
            </AppSelect>
          </AppFormField>
          <div className="md:col-span-2">
            <AppFormField label="Mensagem padrão ao cliente" hint="Texto exibido após abertura da sessão.">
              <AppTextarea placeholder="Bem-vindo ao QRápido..." />
            </AppFormField>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <AppActionButton>Salvar alterações</AppActionButton>
        </div>
      </AppSectionCard>
    </section>
  );
}
