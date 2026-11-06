"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { PurgeTestData, SettingsSection, Switch, ToggleRow } from "@/components/settings/settings-parts";
import {
  AppActionButton,
  AppEmptyState,
  AppFormField,
  AppSkeleton,
  AppTextInput,
} from "@/components/ui/app-design-system";
import { RestaurantsService } from "@/lib/data/services/restaurants-service";
import { SettingsService } from "@/lib/data/services/settings-service";
import { refreshCustomerMenu, useAdminApi } from "@/lib/hooks/use-admin-api";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import { describeFirebaseError } from "@/lib/data/errors";
import type {
  BusinessHours,
  PaymentMethod,
  RestaurantSettings,
  WeekdayKey,
} from "@/lib/types/domain";
import { cn } from "@/lib/utils/cn";
import { appToast } from "@/lib/utils/toast";
import {
  DEFAULT_RESTAURANT_NAME,
  RESTAURANT_NAME_UPDATED_EVENT,
  resolveRestaurantDisplayName,
} from "@/lib/constants/restaurant";
import {
  DEFAULT_BUSINESS_HOURS,
  PAYMENT_LABELS,
  WEEKDAY_LABELS,
} from "@/lib/constants/restaurant-settings";

interface RestaurantForm {
  name: string;
  phone: string;
  address: string;
  legalName: string;
  document: string;
}

const EMPTY_RESTAURANT: RestaurantForm = { name: DEFAULT_RESTAURANT_NAME, phone: "", address: "", legalName: "", document: "" };
const WEEK_ORDER: WeekdayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const SECTIONS = [
  { id: "restaurante", label: "Restaurante" },
  { id: "recibo", label: "Recibo" },
  { id: "pagamentos", label: "Pagamentos" },
  { id: "horarios", label: "Horários" },
  { id: "mesa", label: "Atendimento na mesa" },
] as const;

/** Only digits and the usual CNPJ/CPF punctuation; accepts empty, 11 (CPF) or 14 (CNPJ) digits. */
function documentProblem(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (!value.trim()) return null;
  if (!/^[\d./-]+$/.test(value.trim())) return "Use só números, ponto, barra e traço.";
  if (digits.length !== 11 && digits.length !== 14) return "CPF tem 11 números e CNPJ tem 14.";
  return null;
}

const snapshot = (restaurant: RestaurantForm, settings: RestaurantSettings | null) => JSON.stringify([restaurant, settings]);

export default function ConfiguracoesPage(): JSX.Element {
  const { user } = useAdminAuth();
  const api = useAdminApi();
  const isAdmin = user?.role === "admin";
  const [reloadKey, setReloadKey] = useState(0);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [restaurant, setRestaurant] = useState<RestaurantForm>(EMPTY_RESTAURANT);
  const [saved, setSaved] = useState("");
  const [restaurantDocumentId, setRestaurantDocumentId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isBootstrapping, setIsBootstrapping] = useState(false);

  const settingsService = useMemo(() => new SettingsService({ scope: "admin" }), []);
  const restaurantsService = useMemo(() => new RestaurantsService({ scope: "admin" }), []);

  useEffect(() => {
    const loadSettings = async () => {
      if (!user?.restaurantId) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const [[found], doc] = await Promise.all([
          settingsService.listByRestaurant(user.restaurantId),
          restaurantsService.getByRestaurantId(user.restaurantId),
        ]);
        const nextSettings = found ? { ...found, businessHours: { ...DEFAULT_BUSINESS_HOURS, ...found.businessHours } } : null;
        const nextRestaurant: RestaurantForm = {
          name: resolveRestaurantDisplayName(doc?.name),
          phone: doc?.phone ?? "",
          address: doc?.address ?? "",
          legalName: doc?.legalName ?? "",
          document: doc?.document ?? "",
        };
        setSettings(nextSettings);
        setRestaurant(nextRestaurant);
        setSaved(snapshot(nextRestaurant, nextSettings));
        setRestaurantDocumentId(doc?.id ?? null);
      } catch {
        setSettings(null);
        setRestaurantDocumentId(null);
        setRestaurant(EMPTY_RESTAURANT);
        appToast.error("Falha ao carregar", "Não foi possível carregar as configurações do restaurante.");
      } finally {
        setIsLoading(false);
      }
    };
    void loadSettings();
  }, [restaurantsService, settingsService, user?.restaurantId, reloadKey]);

  const isDirty = settings !== null && saved !== "" && snapshot(restaurant, settings) !== saved;

  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!isDirty) return;
    const onLeave = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [isDirty]);

  /** Creates the restaurant record and default settings on the server (safe, additive). */
  const createInitialSettings = async () => {
    setIsBootstrapping(true);
    try {
      const result = await api<{ done: string[] }>("/api/admin/operations/repair", {});
      appToast.success("Cadastro inicial pronto", result.done.join(" "));
      setReloadKey((key) => key + 1);
    } catch (failure) {
      appToast.error("Falha ao criar configurações", failure instanceof Error ? failure.message : "Tente novamente.");
    } finally {
      setIsBootstrapping(false);
    }
  };

  const patch = (next: Partial<RestaurantSettings>) => setSettings((current) => (current ? { ...current, ...next } : current));
  const patchRestaurant = (next: Partial<RestaurantForm>) => setRestaurant((current) => ({ ...current, ...next }));

  const togglePaymentMethod = (method: PaymentMethod) => {
    if (!settings) return;
    const has = settings.acceptedPaymentMethods.includes(method);
    patch({ acceptedPaymentMethods: has ? settings.acceptedPaymentMethods.filter((item) => item !== method) : [...settings.acceptedPaymentMethods, method] });
  };

  const updateHours = (day: WeekdayKey, change: Partial<BusinessHours[WeekdayKey]>) => {
    if (!settings) return;
    patch({ businessHours: { ...settings.businessHours, [day]: { ...settings.businessHours[day], ...change } } });
  };

  const copyMondayToAll = () => {
    if (!settings) return;
    const monday = settings.businessHours.monday;
    patch({ businessHours: Object.fromEntries(WEEK_ORDER.map((day) => [day, { ...monday }])) as unknown as BusinessHours });
  };

  const docProblem = documentProblem(restaurant.document);

  const saveSettings = async () => {
    if (!settings || !user?.restaurantId) return;
    const name = restaurant.name.trim();
    if (name.length < 2) {
      appToast.error("Nome inválido", "Informe um nome de restaurante com pelo menos 2 caracteres.");
      return;
    }
    if (docProblem) {
      appToast.error("CNPJ ou CPF inválido", docProblem);
      return;
    }
    if (settings.acceptedPaymentMethods.length === 0) {
      appToast.error("Escolha um pagamento", "Marque pelo menos uma forma de pagamento aceita.");
      return;
    }

    setIsSaving(true);
    try {
      // The restaurant document id must be the restaurantId (Firestore rules).
      if (restaurantDocumentId !== user.restaurantId) {
        await api("/api/admin/operations/repair", {});
        setRestaurantDocumentId(user.restaurantId);
      }
      const cleanRestaurant: RestaurantForm = {
        name,
        phone: restaurant.phone.trim().slice(0, 20),
        address: restaurant.address.trim().slice(0, 180),
        legalName: restaurant.legalName.trim().slice(0, 120),
        document: restaurant.document.trim(),
      };
      await restaurantsService.update(user.restaurantId, {
        name: cleanRestaurant.name,
        phone: cleanRestaurant.phone,
        address: cleanRestaurant.address,
        legalName: cleanRestaurant.legalName || null,
        document: cleanRestaurant.document || null,
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
        requireCustomerName: settings.requireCustomerName,
        allowCustomerNotes: settings.allowCustomerNotes,
        serviceFeePercent: settings.serviceFeePercent,
        waiterCallEnabled: settings.waiterCallEnabled,
        billRequestEnabled: settings.billRequestEnabled,
        businessHours: settings.businessHours,
      });
      await refreshCustomerMenu(api);
      setRestaurant(cleanRestaurant);
      setSaved(snapshot(cleanRestaurant, settings));
      window.dispatchEvent(new CustomEvent(RESTAURANT_NAME_UPDATED_EVENT, { detail: name }));
      appToast.success("Configurações salvas", "O cardápio dos clientes já usa as novas regras.");
    } catch (failure) {
      appToast.error(
        "Falha ao salvar",
        failure instanceof Error && failure.name !== "FirebaseError" && !("code" in failure) ? failure.message : describeFirebaseError(failure),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const discard = () => {
    if (!saved) return;
    const [savedRestaurant, savedSettings] = JSON.parse(saved) as [RestaurantForm, RestaurantSettings | null];
    setRestaurant(savedRestaurant);
    setSettings(savedSettings);
  };

  if (isLoading) {
    return (
      <section className="space-y-4" aria-busy="true" aria-label="Carregando configurações">
        <AppSkeleton className="h-52" />
        <AppSkeleton className="h-80" />
      </section>
    );
  }

  if (!settings) {
    return (
      <section className="space-y-4">
        <AppEmptyState
          title="Restaurante ainda sem configuração"
          description="Crie o cadastro inicial (nome do restaurante, formas de pagamento, taxa de serviço). Você pode editar tudo depois."
          action={
            <AppActionButton onClick={createInitialSettings} disabled={isBootstrapping}>
              {isBootstrapping ? "Criando..." : "Criar cadastro inicial"}
            </AppActionButton>
          }
        />
      </section>
    );
  }

  const acceptsPix = settings.acceptedPaymentMethods.includes("pix");
  const sections = isAdmin ? [...SECTIONS, { id: "testes", label: "Dados de teste" }] : SECTIONS;

  return (
    <div className="grid gap-6 pb-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start">
      <nav aria-label="Seções das configurações" className="-mx-4 overflow-x-auto px-4 lg:sticky lg:top-4 lg:mx-0 lg:overflow-visible lg:px-0">
        <ul className="flex gap-2 lg:flex-col lg:gap-0.5">
          {sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className={cn(
                  "block whitespace-nowrap rounded-full border border-[hsl(var(--border-strong))] px-3 py-1.5 text-sm font-medium lg:rounded-[var(--radius-md)] lg:border-transparent lg:px-3 lg:py-2 lg:text-[hsl(var(--foreground-muted))] lg:hover:bg-[hsl(var(--surface-muted))] lg:hover:text-[hsl(var(--foreground))]",
                  section.id === "testes" && "lg:text-[hsl(var(--danger))]",
                )}
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 max-w-3xl space-y-5">
        <SettingsSection id="restaurante" title="Restaurante" description="Como o restaurante aparece no cardápio dos clientes e no recibo.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <AppFormField label="Nome do restaurante">
                <AppTextInput value={restaurant.name} maxLength={120} onChange={(event) => patchRestaurant({ name: event.target.value })} placeholder="Ex.: Cantina da Praça" />
              </AppFormField>
            </div>
            <AppFormField label="Telefone">
              <AppTextInput type="tel" value={restaurant.phone} maxLength={20} onChange={(event) => patchRestaurant({ phone: event.target.value })} placeholder="(11) 99999-0000" />
            </AppFormField>
            <AppFormField label="Endereço">
              <AppTextInput value={restaurant.address} maxLength={180} onChange={(event) => patchRestaurant({ address: event.target.value })} placeholder="Rua, número, bairro, cidade" />
            </AppFormField>
          </div>
        </SettingsSection>

        <SettingsSection id="recibo" title="Recibo" description="Dados impressos no comprovante de consumo entregue ao fechar a conta. Não é nota fiscal: deixe em branco se não quiser mostrar.">
          <div className="grid gap-4 sm:grid-cols-2">
            <AppFormField label="Razão social" hint="Opcional. Nome que está no CNPJ.">
              <AppTextInput value={restaurant.legalName} maxLength={120} onChange={(event) => patchRestaurant({ legalName: event.target.value })} placeholder="Cantina da Praça LTDA" />
            </AppFormField>
            <AppFormField label="CNPJ ou CPF" hint={docProblem ? undefined : "Opcional."} error={docProblem ?? undefined}>
              <AppTextInput inputMode="numeric" value={restaurant.document} maxLength={20} onChange={(event) => patchRestaurant({ document: event.target.value })} placeholder="00.000.000/0001-00" />
            </AppFormField>
          </div>
        </SettingsSection>

        <SettingsSection id="pagamentos" title="Pagamentos" description="O que o cliente pode escolher ao pedir e como a conta é calculada.">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Formas aceitas</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((method) => {
                const on = settings.acceptedPaymentMethods.includes(method);
                return (
                  <label key={method} className={cn("flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2.5 text-sm font-medium", on ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary-soft))]" : "border-[hsl(var(--border-strong))]")}>
                    <input type="checkbox" checked={on} onChange={() => togglePaymentMethod(method)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                    {PAYMENT_LABELS[method]}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-5 max-w-xs">
            <AppFormField label="Taxa de serviço (%)" hint="Use 0 para não cobrar. O servidor recalcula em todo pedido.">
              <AppTextInput type="number" min={0} max={100} step="0.5" value={settings.serviceFeePercent} onChange={(event) => patch({ serviceFeePercent: Math.min(100, Math.max(0, Number(event.target.value) || 0)) })} />
            </AppFormField>
          </div>

          {acceptsPix ? (
            <div className="mt-5 border-t border-[hsl(var(--border))] pt-5">
              <h3 className="text-sm font-semibold">Dados do Pix</h3>
              <p className="mb-3 text-sm text-[hsl(var(--foreground-muted))]">Aparecem para o cliente que escolher pagar com Pix.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <AppFormField label="Chave Pix">
                  <AppTextInput value={settings.pixKey ?? ""} onChange={(event) => patch({ pixKey: event.target.value })} placeholder="CNPJ, e-mail, telefone ou chave aleatória" />
                </AppFormField>
                <AppFormField label="Nome de quem recebe">
                  <AppTextInput value={settings.pixReceiverName ?? ""} onChange={(event) => patch({ pixReceiverName: event.target.value })} placeholder="Cantina da Praça" />
                </AppFormField>
                <AppFormField label="Cidade de quem recebe">
                  <AppTextInput value={settings.pixReceiverCity ?? ""} onChange={(event) => patch({ pixReceiverCity: event.target.value })} placeholder="São Paulo" />
                </AppFormField>
                <AppFormField label="Recado para o cliente" hint="Opcional.">
                  <AppTextInput value={settings.pixInstructions ?? ""} onChange={(event) => patch({ pixInstructions: event.target.value })} placeholder="Mostre o comprovante ao garçom" />
                </AppFormField>
              </div>
            </div>
          ) : null}
        </SettingsSection>

        <SettingsSection id="horarios" title="Horários" description="Dias e horários em que o restaurante funciona.">
          <ul className="divide-y divide-[hsl(var(--border))]">
            {WEEK_ORDER.map((day) => {
              const hours = settings.businessHours[day];
              return (
                <li key={day} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 py-2.5 sm:grid-cols-[2.75rem_8rem_minmax(0,1fr)]">
                  <Switch checked={hours.isOpen} onChange={(isOpen) => updateHours(day, { isOpen })} label={`${WEEKDAY_LABELS[day]}: aberto`} />
                  <span className="text-sm font-semibold">{WEEKDAY_LABELS[day]}</span>
                  {hours.isOpen ? (
                    <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
                      <AppTextInput type="time" aria-label={`${WEEKDAY_LABELS[day]}: abre às`} value={hours.open} onChange={(event) => updateHours(day, { open: event.target.value })} className="h-9 w-[8.5rem]" />
                      <span className="text-sm text-[hsl(var(--foreground-muted))]">até</span>
                      <AppTextInput type="time" aria-label={`${WEEKDAY_LABELS[day]}: fecha às`} value={hours.close} onChange={(event) => updateHours(day, { close: event.target.value })} className="h-9 w-[8.5rem]" />
                    </div>
                  ) : (
                    <span className="col-span-2 text-sm text-[hsl(var(--foreground-muted))] sm:col-span-1">Fechado</span>
                  )}
                </li>
              );
            })}
          </ul>
          <AppActionButton variant="ghost" className="mt-2 -ml-2" onClick={copyMondayToAll}>Usar o horário de segunda em todos os dias</AppActionButton>
        </SettingsSection>

        <SettingsSection id="mesa" title="Atendimento na mesa" description="O que o cliente pode fazer pelo celular depois de ler o QR Code.">
          <div className="divide-y divide-[hsl(var(--border))]">
            <ToggleRow label="Chamar o garçom" description="Botão para pedir ajuda; aparece no Salão." checked={settings.waiterCallEnabled} onChange={(waiterCallEnabled) => patch({ waiterCallEnabled })} />
            <ToggleRow label="Pedir a conta" description="O cliente avisa que quer fechar a conta." checked={settings.billRequestEnabled} onChange={(billRequestEnabled) => patch({ billRequestEnabled })} />
            <ToggleRow label="Observação no pedido" description="Campo para “sem cebola”, “ponto da carne” etc." checked={settings.allowCustomerNotes} onChange={(allowCustomerNotes) => patch({ allowCustomerNotes })} />
            <ToggleRow label="Pedir o nome do cliente" description="O nome aparece na Cozinha junto com o pedido." checked={settings.requireCustomerName} onChange={(requireCustomerName) => patch({ requireCustomerName })} />
          </div>

          <div className="mt-4 grid gap-5 border-t border-[hsl(var(--border))] pt-5 sm:grid-cols-2">
            <AppFormField label="Tempo de atendimento (minutos)" hint="Depois disso a mesa só pede de novo quando a equipe renovar.">
              <AppTextInput type="number" min={15} max={720} value={settings.defaultSessionDurationMinutes} onChange={(event) => patch({ defaultSessionDurationMinutes: Math.round(Number(event.target.value)) || 30 })} />
            </AppFormField>
            <div className="space-y-1.5 sm:col-span-2">
              <p className="text-sm font-semibold">Limite contra pedidos repetidos</p>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>Até</span>
                <AppTextInput type="number" min={1} max={20} aria-label="Quantidade máxima de pedidos" value={settings.maxOrdersPerWindow} onChange={(event) => patch({ maxOrdersPerWindow: Math.min(20, Math.round(Number(event.target.value)) || 1) })} className="h-9 w-16" />
                <span>pedidos a cada</span>
                <AppTextInput type="number" min={30} aria-label="Intervalo em segundos" value={settings.antiSpamWindowSeconds} onChange={(event) => patch({ antiSpamWindowSeconds: Math.min(3600, Math.round(Number(event.target.value)) || 30) })} className="h-9 w-20" />
                <span>segundos</span>
              </div>
              <p className="text-xs text-[hsl(var(--foreground-muted))]">Por mesa. Evita pedidos em dobro e brincadeiras.</p>
            </div>
          </div>
        </SettingsSection>

        {isAdmin ? (
          <SettingsSection id="testes" tone="danger" title="Dados de teste" description="Para limpar os pedidos feitos em testes antes de começar o uso real. Só o administrador vê esta parte.">
            <PurgeTestData api={api} />
          </SettingsSection>
        ) : null}

        {isDirty ? (
          <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[hsl(var(--border-strong))] bg-[hsl(var(--background-elevated))] p-3 pl-4 shadow-[0_8px_28px_hsl(var(--foreground)/0.14)] lg:bottom-4" role="status">
            <p className="text-sm font-semibold">Alterações não salvas</p>
            <div className="flex gap-2">
              <AppActionButton variant="ghost" onClick={discard} disabled={isSaving}>Descartar</AppActionButton>
              <AppActionButton onClick={saveSettings} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isSaving ? "Salvando..." : "Salvar"}
              </AppActionButton>
            </div>
          </div>
        ) : null}
      </div>

    </div>
  );
}
