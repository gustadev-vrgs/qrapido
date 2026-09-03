"use client";

import { useEffect, useMemo, useState } from "react";

import { AppActionButton, AppEmptyState, AppFormField, AppSectionCard, AppSelect, AppTextInput } from "@/components/ui/app-design-system";
import { RestaurantsService } from "@/lib/data/services/restaurants-service";
import { SettingsService } from "@/lib/data/services/settings-service";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import type { BusinessHours, PaymentMethod, RestaurantSettings, WeekdayKey } from "@/lib/types/domain";
import { appToast } from "@/lib/utils/toast";
import { DEFAULT_RESTAURANT_NAME, RESTAURANT_NAME_UPDATED_EVENT, resolveRestaurantDisplayName } from "@/lib/constants/restaurant";
  tuesday: "Terça",
  wednesday: "Quarta",
  thursday: "Quinta",
  friday: "Sexta",
  saturday: "Sábado",
  sunday: "Domingo"
};

const paymentLabels: Record<PaymentMethod, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  debit_card: "Cartão de débito",
  credit_card: "Cartão de crédito",
  card_on_counter: "Cartão no caixa",
  card_on_table: "Cartão na mesa"
};

const defaultBusinessHours: BusinessHours = {
  monday: { isOpen: true, open: "09:00", close: "18:00" },
  tuesday: { isOpen: true, open: "09:00", close: "18:00" },
  wednesday: { isOpen: true, open: "09:00", close: "18:00" },
  thursday: { isOpen: true, open: "09:00", close: "18:00" },
  friday: { isOpen: true, open: "09:00", close: "18:00" },
  saturday: { isOpen: false, open: "09:00", close: "18:00" },
  sunday: { isOpen: false, open: "09:00", close: "18:00" }
};

export default function ConfiguracoesPage(): JSX.Element {
  const { user } = useAdminAuth();
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [restaurantDocumentId, setRestaurantDocumentId] = useState<string | null>(null);
        setRestaurantName(resolveRestaurantDisplayName(restaurant?.name));
  const [isSaving, setIsSaving] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(false);

  const settingsService = useMemo(() => new SettingsService({ scope: "admin" }), []);
  const restaurantsService = useMemo(() => new RestaurantsService({ scope: "admin" }), []);

  useEffect(() => {
    const load = async () => {
      if (!user?.restaurantId) return;
      try {
        const [found] = await settingsService.listByRestaurant(user.restaurantId);
        setSettings(found ?? null);

        const restaurant = await restaurantsService.getByRestaurantId(user.restaurantId);
        setRestaurantDocumentId(restaurant?.id ?? null);
        setRestaurantName(restaurant?.name ?? "");
      } catch {
        setSettings(null);
        setRestaurantDocumentId(null);
      }
    };

    void load();
  }, [restaurantsService, settingsService, user?.restaurantId]);

  const createInitialSettings = async () => {
    if (!user?.restaurantId) return;

    setIsBootstrapping(true);
    try {
      await settingsService.create({
        restaurantId: user.restaurantId,
        acceptedPaymentMethods: ["pix"],
        pixKey: null,
        pixReceiverName: null,
        pixReceiverCity: null,
        pixInstructions: null,
        businessHours: defaultBusinessHours,
        antiSpamWindowSeconds: 60,
        maxOrdersPerWindow: 3,
        defaultSessionDurationMinutes: 90,
        allowSessionPin: false,
        requireCustomerName: false,
        waiterCallEnabled: true,
        billRequestEnabled: true
      });

      const [created] = await settingsService.listByRestaurant(user.restaurantId);
      setSettings(created ?? null);
      appToast.success("Configurações criadas", "Agora você pode editar e salvar as preferências reais do restaurante.");
    } catch {
      appToast.error("Falha ao criar configurações", "Não foi possível inicializar as configurações no Firestore.");
    } finally {
      setIsBootstrapping(false);
    }
  };

  const togglePaymentMethod = (method: PaymentMethod) => {
    if (!settings) return;
    const has = settings.acceptedPaymentMethods.includes(method);
    const next = has ? settings.acceptedPaymentMethods.filter((item) => item !== method) : [...settings.acceptedPaymentMethods, method];
    setSettings({ ...settings, acceptedPaymentMethods: next });
  };

  const updateHours = (day: WeekdayKey, patch: Partial<BusinessHours[WeekdayKey]>) => {
    if (!settings) return;
    setSettings({
      ...settings,
      businessHours: {
        ...settings.businessHours,
        [day]: { ...settings.businessHours[day], ...patch }
      }
    });
  };

  const saveSettings = async () => {
    if (!settings) return;

    const trimmedRestaurantName = restaurantName.trim();
    if (!trimmedRestaurantName || trimmedRestaurantName.length < 2) {
      appToast.error("Nome inválido", "Informe um nome de restaurante com pelo menos 2 caracteres.");
      return;
    }

    if (!restaurantDocumentId) {
      appToast.error("Restaurante não encontrado", "Não foi possível localizar o cadastro do restaurante para atualizar o nome.");
      return;
    }

    setIsSaving(true);
    try {
      await restaurantsService.update(restaurantDocumentId, {
        name: trimmedRestaurantName
      });
      await settingsService.update(settings.id, {
        acceptedPaymentMethods: settings.acceptedPaymentMethods,
        pixKey: settings.pixKey,
        pixReceiverName: settings.pixReceiverName ?? null,
        pixReceiverCity: settings.pixReceiverCity ?? null,
        pixInstructions: settings.pixInstructions ?? null,
        defaultSessionDurationMinutes: settings.defaultSessionDurationMinutes,
        antiSpamWindowSeconds: settings.antiSpamWindowSeconds,
        maxOrdersPerWindow: settings.maxOrdersPerWindow,
        allowSessionPin: settings.allowSessionPin,
        waiterCallEnabled: settings.waiterCallEnabled,
        billRequestEnabled: settings.billRequestEnabled,
        businessHours: settings.businessHours
      });
      setRestaurantName(trimmedRestaurantName);
      appToast.success("Configurações salvas", "Nome do restaurante e preferências operacionais atualizados com sucesso.");
    } catch {
      appToast.error("Falha ao salvar", "Não foi possível persistir as alterações no Firebase/Firestore.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!settings) {
    return (
      <section className="space-y-4">
        <AppEmptyState
          title="Nenhuma configuração cadastrada"
          description="Crie o documento inicial de configurações para começar a operar com dados reais no Firestore."
          action={
            <AppActionButton onClick={createInitialSettings} disabled={isBootstrapping}>
              {isBootstrapping ? "Criando..." : "Criar configurações"}
            </AppActionButton>
          }
        />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <AppSectionCard title="Dados do restaurante" description="Base operacional para atendimento e cobrança.">
        <div className="grid gap-4 md:grid-cols-2">
          <AppFormField label="Nome do restaurante">
            <AppTextInput value={restaurantName} onChange={(event) => setRestaurantName(event.target.value)} placeholder="Nome do restaurante" />
          </AppFormField>
          <AppFormField label="CNPJ ou chave PIX">
            <AppTextInput value={settings.pixKey ?? ""} onChange={(event) => setSettings({ ...settings, pixKey: event.target.value })} placeholder="contato@restaurante.com" />
          </AppFormField>
          <AppFormField label="Nome do recebedor PIX">
            <AppTextInput value={settings.pixReceiverName ?? ""} onChange={(event) => setSettings({ ...settings, pixReceiverName: event.target.value })} placeholder="Nome exibido no checkout" />
          </AppFormField>
          <AppFormField label="Cidade do recebedor PIX">
            <AppTextInput value={settings.pixReceiverCity ?? ""} onChange={(event) => setSettings({ ...settings, pixReceiverCity: event.target.value })} placeholder="São Paulo" />
          </AppFormField>
          <AppFormField label="Instrução de pagamento PIX">
            <AppTextInput value={settings.pixInstructions ?? ""} onChange={(event) => setSettings({ ...settings, pixInstructions: event.target.value })} placeholder="Instrução opcional para simulação" />
          </AppFormField>
        </div>
      </AppSectionCard>

      <AppSectionCard title="Horário de funcionamento" description="Defina abertura e fechamento por dia da semana.">
        <div className="grid gap-3 md:grid-cols-2">
          {(Object.keys(settings.businessHours) as WeekdayKey[]).map((day) => (
            <div key={day} className="grid gap-2 rounded-xl border border-[hsl(var(--border-strong))] p-3">
              <label className="flex items-center justify-between text-sm font-medium">
                {weekdayLabels[day]}
                <input type="checkbox" checked={settings.businessHours[day].isOpen} onChange={(event) => updateHours(day, { isOpen: event.target.checked })} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <AppTextInput type="time" value={settings.businessHours[day].open} onChange={(event) => updateHours(day, { open: event.target.value })} disabled={!settings.businessHours[day].isOpen} />
                <AppTextInput type="time" value={settings.businessHours[day].close} onChange={(event) => updateHours(day, { close: event.target.value })} disabled={!settings.businessHours[day].isOpen} />
              </div>
            </div>
          ))}
        </div>
      </AppSectionCard>

      <AppSectionCard title="Fluxo de atendimento" description="Limites e recursos do atendimento por QR.">
        <div className="grid gap-4 md:grid-cols-2">
          <AppFormField label="Duração padrão da sessão (min)">
            <AppTextInput
              type="number"
              min={30}
              value={settings.defaultSessionDurationMinutes}
              onChange={(event) => setSettings({ ...settings, defaultSessionDurationMinutes: Number(event.target.value) || 30 })}
            />
          </AppFormField>
          <AppFormField label="Limite anti-spam (segundos)">
            <AppTextInput type="number" min={30} value={settings.antiSpamWindowSeconds} onChange={(event) => setSettings({ ...settings, antiSpamWindowSeconds: Number(event.target.value) || 30 })} />
          </AppFormField>
          <AppFormField label="Máximo de pedidos por janela">
            <AppTextInput type="number" min={1} value={settings.maxOrdersPerWindow} onChange={(event) => setSettings({ ...settings, maxOrdersPerWindow: Number(event.target.value) || 1 })} />
          </AppFormField>
          <AppFormField label="Métodos de pagamento aceitos" hint="Selecione múltiplos métodos conforme a operação.">
            <div className="grid grid-cols-2 gap-2 text-sm">
              {(Object.keys(paymentLabels) as PaymentMethod[]).map((method) => (
                <label key={method} className="flex items-center gap-2 rounded-lg border border-[hsl(var(--border-strong))] p-2">
                  <input type="checkbox" checked={settings.acceptedPaymentMethods.includes(method)} onChange={() => togglePaymentMethod(method)} />
                  {paymentLabels[method]}
                </label>
              ))}
            </div>
          </AppFormField>
          <AppFormField label="PIN de sessão">
            <AppSelect value={settings.allowSessionPin ? "enabled" : "disabled"} onChange={(event) => setSettings({ ...settings, allowSessionPin: event.target.value === "enabled" })}>
              <option value="enabled">Habilitado</option>
              <option value="disabled">Desabilitado</option>
            </AppSelect>
          </AppFormField>
          <AppFormField label="Chamar garçom">
            <AppSelect value={settings.waiterCallEnabled ? "enabled" : "disabled"} onChange={(event) => setSettings({ ...settings, waiterCallEnabled: event.target.value === "enabled" })}>
              <option value="enabled">Habilitado</option>
              <option value="disabled">Desabilitado</option>
            </AppSelect>
          </AppFormField>
          <AppFormField label="Pedir conta">
            <AppSelect value={settings.billRequestEnabled ? "enabled" : "disabled"} onChange={(event) => setSettings({ ...settings, billRequestEnabled: event.target.value === "enabled" })}>
              <option value="enabled">Habilitado</option>
              <option value="disabled">Desabilitado</option>
            </AppSelect>
          </AppFormField>
        </div>

        <div className="mt-4 flex justify-end">
          <AppActionButton onClick={saveSettings} disabled={isSaving}>{isSaving ? "Salvando..." : "Salvar configurações"}</AppActionButton>
        </div>
      </AppSectionCard>
    </section>
  );
}
