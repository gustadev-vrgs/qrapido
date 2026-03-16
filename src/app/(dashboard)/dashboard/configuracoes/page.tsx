"use client";

import { useEffect, useMemo, useState } from "react";

import { AppActionButton, AppFormField, AppSectionCard, AppSelect, AppTextInput } from "@/components/ui/app-design-system";
import { SettingsService } from "@/lib/data/services/settings-service";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import { mockRestaurantSettings } from "@/lib/mocks/basic";
import type { BusinessHours, PaymentMethod, RestaurantSettings, WeekdayKey } from "@/lib/types/domain";
import { appToast } from "@/lib/utils/toast";

const weekdayLabels: Record<WeekdayKey, string> = {
  monday: "Segunda",
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

export default function ConfiguracoesPage(): JSX.Element {
  const { user } = useAdminAuth();
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const settingsService = useMemo(() => new SettingsService({ scope: "admin" }), []);

  useEffect(() => {
    const load = async () => {
      if (!user?.restaurantId) return;
      try {
        const [found] = await settingsService.listByRestaurant(user.restaurantId);
        setSettings(found ?? mockRestaurantSettings);
      } catch {
        setSettings(mockRestaurantSettings);
      }
    };

    void load();
  }, [settingsService, user?.restaurantId]);

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
    setIsSaving(true);
    try {
      await settingsService.update(settings.id, {
        acceptedPaymentMethods: settings.acceptedPaymentMethods,
        pixKey: settings.pixKey,
        defaultSessionDurationMinutes: settings.defaultSessionDurationMinutes,
        antiSpamWindowSeconds: settings.antiSpamWindowSeconds,
        maxOrdersPerWindow: settings.maxOrdersPerWindow,
        allowSessionPin: settings.allowSessionPin,
        waiterCallEnabled: settings.waiterCallEnabled,
        billRequestEnabled: settings.billRequestEnabled,
        businessHours: settings.businessHours
      });
      appToast.success("Configurações salvas", "Preferências operacionais atualizadas com sucesso.");
    } catch {
      appToast.error("Falha ao salvar", "Não foi possível persistir no Firebase. Mantido localmente para demonstração.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!settings) {
    return <section className="space-y-4">Carregando configurações...</section>;
  }

  return (
    <section className="space-y-4">
      <AppSectionCard title="Dados do restaurante" description="Base operacional para atendimento e cobrança.">
        <div className="grid gap-4 md:grid-cols-2">
          <AppFormField label="Nome do restaurante">
            <AppTextInput value="Bistrô Bela Vista" readOnly />
          </AppFormField>
          <AppFormField label="Chave Pix">
            <AppTextInput value={settings.pixKey ?? ""} onChange={(event) => setSettings({ ...settings, pixKey: event.target.value })} placeholder="contato@restaurante.com" />
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
