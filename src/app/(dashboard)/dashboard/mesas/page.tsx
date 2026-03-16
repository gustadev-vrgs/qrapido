"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  DoorClosed,
  DoorOpen,
  KeyRound,
  Loader2,
  Lock,
  QrCode,
  Search,
  UserRound,
  Users,
  X
} from "lucide-react";

import {
  AppActionButton,
  AppDataCard,
  AppEmptyState,
  AppFilterBar,
  AppFormField,
  AppSearchInput,
  AppSelect,
  AppSectionCard,
  AppStatusBadge,
  AppTextInput,
  AppTextarea,
  AppSurface
} from "@/components/ui/app-design-system";
import { tableStatusLabels } from "@/lib/constants/status-labels";
import { OrdersService } from "@/lib/data/services/orders-service";
import { SessionsService } from "@/lib/data/services/sessions-service";
import { SettingsService } from "@/lib/data/services/settings-service";
import { TablesService } from "@/lib/data/services/tables-service";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import type { Order, Table, TableSession, TableStatus } from "@/lib/types/domain";
import { formatDateTime } from "@/lib/utils/formatters";
import { createQrDataUrl } from "@/lib/utils/qr";
import { appToast } from "@/lib/utils/toast";

const TABLE_STATUS_FILTERS: Array<{ value: "all" | TableStatus; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "free", label: "Livres" },
  { value: "active", label: "Ativas" },
  { value: "awaiting_payment", label: "Aguardando pagamento" },
  { value: "closed", label: "Encerradas" },
  { value: "blocked", label: "Bloqueadas" }
];

const ORDER_ACTIVE_STATUSES = ["received", "confirmed", "in_preparation", "ready"];

const tableStatusStyles: Record<TableStatus, { tone: "success" | "info" | "warning" | "neutral" | "danger"; accent: string }> = {
  free: {
    tone: "success",
    accent: "border-[hsl(var(--success)/0.35)] bg-[hsl(var(--success)/0.08)]"
  },
  active: {
    tone: "info",
    accent: "border-[hsl(var(--info)/0.35)] bg-[hsl(var(--info)/0.08)]"
  },
  awaiting_payment: {
    tone: "warning",
    accent: "border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.08)]"
  },
  closed: {
    tone: "neutral",
    accent: "border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))]"
  },
  blocked: {
    tone: "danger",
    accent: "border-[hsl(var(--danger)/0.35)] bg-[hsl(var(--danger)/0.08)]"
  }
};

interface OpenTableFormState {
  tableId: string;
  label: string;
  number: string;
  capacity: string;
  currentPeopleCount: string;
  activeSessionLimit: string;
  pinCode: string;
  operationalNotes: string;
}

const defaultFormState: OpenTableFormState = {
  tableId: "",
  label: "",
  number: "",
  capacity: "4",
  currentPeopleCount: "1",
  activeSessionLimit: "1",
  pinCode: "",
  operationalNotes: ""
};

function getModalTitle(table: Table | null): string {
  if (!table) return "Abrir mesa";
  return `Abrir ${table.label || `Mesa ${table.number}`}`;
}

function safeString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value;
}

export default function MesasPage(): JSX.Element {
  const { user } = useAdminAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tables, setTables] = useState<Table[]>([]);
  const [sessionsByTable, setSessionsByTable] = useState<Record<string, TableSession[]>>({});
  const [ordersByTable, setOrdersByTable] = useState<Record<string, Order[]>>({});
  const [allowSessionPin, setAllowSessionPin] = useState(false);

  const [statusFilter, setStatusFilter] = useState<"all" | TableStatus>("all");
  const [search, setSearch] = useState("");

  const [openModalVisible, setOpenModalVisible] = useState(false);
  const [detailsModalTableId, setDetailsModalTableId] = useState<string | null>(null);
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const [openingTableId, setOpeningTableId] = useState<string | null>(null);
  const [closingTableId, setClosingTableId] = useState<string | null>(null);
  const [openTableForm, setOpenTableForm] = useState<OpenTableFormState>(defaultFormState);

  const tablesService = useMemo(() => new TablesService({ scope: "admin" }), []);
  const sessionsService = useMemo(() => new SessionsService({ scope: "admin" }), []);
  const ordersService = useMemo(() => new OrdersService({ scope: "admin" }), []);
  const settingsService = useMemo(() => new SettingsService({ scope: "admin" }), []);

  const loadData = async (showRefreshing = false) => {
    if (!user?.restaurantId) return;

    if (showRefreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const [tablesData, activeSessions, ordersData, settingsData] = await Promise.all([
        tablesService.listByRestaurant(user.restaurantId),
        sessionsService.listActiveByRestaurant(user.restaurantId),
        ordersService.listByRestaurant(user.restaurantId),
        settingsService.listByRestaurant(user.restaurantId)
      ]);

      const sessionMap = activeSessions.reduce<Record<string, TableSession[]>>((acc, session) => {
        acc[session.tableId] = [...(acc[session.tableId] ?? []), session];
        return acc;
      }, {});

      const relevantOrders = ordersData.filter((order) => ORDER_ACTIVE_STATUSES.includes(order.status));
      const orderMap = relevantOrders.reduce<Record<string, Order[]>>((acc, order) => {
        acc[order.tableId] = [...(acc[order.tableId] ?? []), order];
        return acc;
      }, {});

      setTables(tablesData);
      setSessionsByTable(sessionMap);
      setOrdersByTable(orderMap);
      setAllowSessionPin(Boolean(settingsData[0]?.allowSessionPin));
    } catch (error) {
      console.error(error);
      appToast.error("Não foi possível carregar o módulo de mesas", "Verifique conexão e permissões de acesso.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.restaurantId]);

  const filteredTables = useMemo(() => {
    const query = search.trim().toLowerCase();

    return tables.filter((table) => {
      const matchesStatus = statusFilter === "all" || table.status === statusFilter;
      if (!matchesStatus) return false;
      if (!query) return true;

      const byNumber = String(table.number).includes(query);
      const byLabel = safeString(table.label).toLowerCase().includes(query);
      return byNumber || byLabel;
    });
  }, [search, statusFilter, tables]);

  const summary = useMemo(() => {
    const activeCount = tables.filter((table) => table.status === "active").length;
    const awaitingCount = tables.filter((table) => table.status === "awaiting_payment").length;
    const blockedCount = tables.filter((table) => table.status === "blocked").length;
    const freeCount = tables.filter((table) => table.status === "free").length;
    const totalPeople = tables.reduce((acc, table) => acc + table.currentPeopleCount, 0);
    const activeSessionsTotal = Object.values(sessionsByTable).reduce((acc, sessions) => acc + sessions.length, 0);

    return {
      total: tables.length,
      activeCount,
      awaitingCount,
      blockedCount,
      freeCount,
      totalPeople,
      activeSessionsTotal
    };
  }, [sessionsByTable, tables]);

  const detailsTable = useMemo(() => tables.find((table) => table.id === detailsModalTableId) ?? null, [detailsModalTableId, tables]);

  const handleOpenModal = (table: Table) => {
    setOpenTableForm({
      tableId: table.id,
      label: table.label,
      number: String(table.number),
      capacity: String(table.capacity),
      currentPeopleCount: String(Math.max(1, table.currentPeopleCount || 1)),
      activeSessionLimit: String(Math.max(1, table.activeSessionLimit || 1)),
      pinCode: table.pinCode ?? "",
      operationalNotes: ""
    });
    setOpenModalVisible(true);
  };

  const handleCloseTable = async (table: Table) => {
    if (!confirm(`Encerrar ${table.label || `Mesa ${table.number}`}?`)) {
      return;
    }

    try {
      setClosingTableId(table.id);
      await fetch("/api/admin/table/close", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tableId: table.id })
      });
      appToast.success("Mesa encerrada", "A mesa foi movida para status encerrada.");
      await loadData(true);
    } catch (error) {
      console.error(error);
      appToast.error("Falha ao encerrar mesa", "Tente novamente em instantes.");
    } finally {
      setClosingTableId(null);
    }
  };

  const submitOpenTable = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const table = tables.find((item) => item.id === openTableForm.tableId);
    if (!table) {
      appToast.error("Mesa não encontrada", "Atualize a tela e tente novamente.");
      return;
    }

    const currentPeopleCount = Number(openTableForm.currentPeopleCount);
    const capacity = Number(openTableForm.capacity);
    const activeSessionLimit = Number(openTableForm.activeSessionLimit);

    if (!Number.isFinite(currentPeopleCount) || currentPeopleCount < 1) {
      appToast.error("Quantidade de pessoas inválida", "Informe um valor maior ou igual a 1.");
      return;
    }

    if (!Number.isFinite(capacity) || capacity < 1) {
      appToast.error("Capacidade inválida", "Informe um valor de capacidade válido.");
      return;
    }

    if (currentPeopleCount > capacity) {
      appToast.error("Capacidade excedida", "A quantidade atual de pessoas não pode ser maior que a capacidade.");
      return;
    }

    if (!Number.isFinite(activeSessionLimit) || activeSessionLimit < 1) {
      appToast.error("Limite de sessões inválido", "Defina ao menos 1 sessão ativa.");
      return;
    }

    const pinCode = allowSessionPin ? openTableForm.pinCode.trim() || null : null;
    if (allowSessionPin && pinCode && !/^\d{4}$/.test(pinCode)) {
      appToast.error("PIN inválido", "Use 4 dígitos numéricos.");
      return;
    }

    try {
      setOpeningTableId(table.id);
      const response = await fetch("/api/admin/table/open", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tableId: table.id,
          label: openTableForm.label.trim() || table.label,
          number: Number(openTableForm.number) || table.number,
          capacity,
          currentPeopleCount,
          activeSessionLimit,
          pinCode
        })
      });

      if (!response.ok) {
        throw new Error("Falha ao abrir mesa");
      }

      appToast.success("Mesa aberta com sucesso", "Mesa pronta para receber sessões e pedidos.");
      if (openTableForm.operationalNotes.trim()) {
        appToast.info("Observação operacional registrada no fluxo", openTableForm.operationalNotes.trim());
      }
      setOpenModalVisible(false);
      setOpenTableForm(defaultFormState);
      await loadData(true);
    } catch (error) {
      console.error(error);
      appToast.error("Falha ao abrir mesa", "Não foi possível atualizar o status da mesa.");
    } finally {
      setOpeningTableId(null);
    }
  };

  useEffect(() => {
    if (!detailsTable?.qrCodeValue) {
      setQrPreview(null);
      return;
    }

    void createQrDataUrl(detailsTable.qrCodeValue)
      .then(setQrPreview)
      .catch(() => setQrPreview(null));
  }, [detailsTable?.id, detailsTable?.qrCodeValue]);

  const renderTableCardActions = (table: Table) => {
    const isOpening = openingTableId === table.id;
    const isClosing = closingTableId === table.id;

    return (
      <div className="flex flex-wrap gap-2">
        {(table.status === "free" || table.status === "closed") && (
          <AppActionButton variant="primary" onClick={() => handleOpenModal(table)} disabled={isOpening} className="gap-2">
            {isOpening ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorOpen className="h-4 w-4" />}
            Abrir mesa
          </AppActionButton>
        )}

        {(table.status === "active" || table.status === "awaiting_payment") && (
          <AppActionButton variant="destructive" onClick={() => void handleCloseTable(table)} disabled={isClosing} className="gap-2">
            {isClosing ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorClosed className="h-4 w-4" />}
            Encerrar mesa
          </AppActionButton>
        )}

        <AppActionButton variant="secondary" onClick={() => setDetailsModalTableId(table.id)}>
          Detalhes
        </AppActionButton>
      </div>
    );
  };

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AppDataCard title="Mesas totais" metadata="Visão geral operacional" status={<AppStatusBadge tone="info">{summary.total} registradas</AppStatusBadge>}>
          <p className="text-sm text-[hsl(var(--foreground-muted))]">{summary.activeCount} ativas • {summary.freeCount} livres</p>
        </AppDataCard>

        <AppDataCard
          title="Mesas em atendimento"
          metadata="Status active"
          status={<AppStatusBadge tone="info">{summary.activeCount}</AppStatusBadge>}
        >
          <p className="text-sm text-[hsl(var(--foreground-muted))]">{summary.totalPeople} pessoas no salão agora</p>
        </AppDataCard>

        <AppDataCard
          title="Aguardando pagamento"
          metadata="Status awaiting_payment"
          status={<AppStatusBadge tone="warning">{summary.awaitingCount}</AppStatusBadge>}
        >
          <p className="text-sm text-[hsl(var(--foreground-muted))]">Priorize fechamento e giro das mesas</p>
        </AppDataCard>

        <AppDataCard
          title="Sessões ativas"
          metadata="Clientes conectados"
          status={<AppStatusBadge tone="success">{summary.activeSessionsTotal}</AppStatusBadge>}
        >
          <p className="text-sm text-[hsl(var(--foreground-muted))]">{summary.blockedCount} mesa(s) bloqueada(s)</p>
        </AppDataCard>
      </div>

      <AppFilterBar className="gap-3">
        <AppSearchInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar mesa por número ou nome"
          className="w-full md:flex-1"
        />

        <div className="flex w-full flex-wrap gap-2 md:w-auto">
          {TABLE_STATUS_FILTERS.map((filter) => (
            <button
              type="button"
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={`rounded-xl border px-3 py-2 text-xs font-medium uppercase tracking-[0.12em] transition ${
                statusFilter === filter.value
                  ? "border-[hsl(var(--focus-ring)/0.45)] bg-[hsl(var(--primary)/0.2)] text-[hsl(var(--foreground))]"
                  : "border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))] text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--foreground))]"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <AppActionButton variant="secondary" onClick={() => void loadData(true)} className="md:ml-auto" disabled={isRefreshing}>
          {isRefreshing ? "Atualizando..." : "Atualizar"}
        </AppActionButton>
      </AppFilterBar>

      <AppSectionCard
        title="Mapa operacional de mesas"
        description="Acompanhe status, ocupação, sessões ativas e ações rápidas da equipe em tempo real."
        action={
          <AppStatusBadge tone={allowSessionPin ? "info" : "neutral"}>{allowSessionPin ? "PIN habilitado" : "PIN desabilitado"}</AppStatusBadge>
        }
      >
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <AppSurface key={index} className="h-52 animate-pulse border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]" />
            ))}
          </div>
        ) : filteredTables.length === 0 ? (
          <AppEmptyState
            title="Nenhuma mesa encontrada para este filtro"
            description="Ajuste status e busca para visualizar as mesas do salão."
            action={
              <AppActionButton
                variant="secondary"
                onClick={() => {
                  setStatusFilter("all");
                  setSearch("");
                }}
              >
                Limpar filtros
              </AppActionButton>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {filteredTables.map((table) => {
              const statusMeta = tableStatusStyles[table.status];
              const activeSessions = sessionsByTable[table.id] ?? [];
              const activeOrders = ordersByTable[table.id] ?? [];
              const occupancyPercent = table.capacity > 0 ? Math.min(100, Math.round((table.currentPeopleCount / table.capacity) * 100)) : 0;

              return (
                <article key={table.id} className={`rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg ${statusMeta.accent}`}>
                  <header className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--foreground-muted))]">Mesa {table.number}</p>
                      <h3 className="mt-1 text-xl font-semibold">{table.label}</h3>
                    </div>
                    <AppStatusBadge tone={statusMeta.tone}>{tableStatusLabels[table.status]}</AppStatusBadge>
                  </header>

                  <div className="space-y-2 text-sm text-[hsl(var(--foreground-muted))]">
                    <p className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      {table.currentPeopleCount}/{table.capacity} pessoas ({occupancyPercent}% ocupação)
                    </p>
                    <p className="flex items-center gap-2">
                      <UserRound className="h-4 w-4" />
                      Sessões ativas: {activeSessions.length} / limite {table.activeSessionLimit}
                    </p>
                    <p className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Pedidos ativos: {activeOrders.length}
                    </p>
                    <p className="flex items-center gap-2 truncate">
                      <QrCode className="h-4 w-4" />
                      QR: <span className="truncate">{table.qrCodeValue}</span>
                    </p>
                  </div>

                  <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-[hsl(var(--surface-muted))]">
                    <span className="h-full rounded-full bg-[hsl(var(--primary))]" style={{ width: `${occupancyPercent}%` }} />
                  </div>

                  <div className="mt-4">{renderTableCardActions(table)}</div>
                </article>
              );
            })}
          </div>
        )}
      </AppSectionCard>

      {openModalVisible ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <div className="app-surface-strong w-full max-w-2xl space-y-4 rounded-2xl p-5">
            <header className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--foreground-muted))]">Operação de abertura</p>
                <h3 className="text-xl font-semibold">{getModalTitle(tables.find((item) => item.id === openTableForm.tableId) ?? null)}</h3>
              </div>
              <button type="button" onClick={() => setOpenModalVisible(false)} className="rounded-lg p-1 text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--surface-muted))]">
                <X className="h-5 w-5" />
              </button>
            </header>

            <form className="grid gap-4 md:grid-cols-2" onSubmit={submitOpenTable}>
              <AppFormField label="Número da mesa">
                <AppTextInput
                  type="number"
                  min={1}
                  value={openTableForm.number}
                  onChange={(event) => setOpenTableForm((prev) => ({ ...prev, number: event.target.value }))}
                  required
                />
              </AppFormField>

              <AppFormField label="Nome da mesa">
                <AppTextInput value={openTableForm.label} onChange={(event) => setOpenTableForm((prev) => ({ ...prev, label: event.target.value }))} required />
              </AppFormField>

              <AppFormField label="Capacidade">
                <AppTextInput
                  type="number"
                  min={1}
                  max={20}
                  value={openTableForm.capacity}
                  onChange={(event) => setOpenTableForm((prev) => ({ ...prev, capacity: event.target.value }))}
                  required
                />
              </AppFormField>

              <AppFormField label="Quantidade atual de pessoas">
                <AppTextInput
                  type="number"
                  min={1}
                  max={40}
                  value={openTableForm.currentPeopleCount}
                  onChange={(event) => setOpenTableForm((prev) => ({ ...prev, currentPeopleCount: event.target.value }))}
                  required
                />
              </AppFormField>

              <AppFormField label="Limite de sessões simultâneas">
                <AppSelect
                  value={openTableForm.activeSessionLimit}
                  onChange={(event) => setOpenTableForm((prev) => ({ ...prev, activeSessionLimit: event.target.value }))}
                >
                  <option value="1">1 sessão</option>
                  <option value="2">2 sessões</option>
                  <option value="3">3 sessões</option>
                  <option value="4">4 sessões</option>
                  <option value="5">5 sessões</option>
                </AppSelect>
              </AppFormField>

              <AppFormField label="PIN de acesso" hint={allowSessionPin ? "Use 4 dígitos numéricos." : "PIN desabilitado nas configurações."}>
                <AppTextInput
                  type="password"
                  placeholder={allowSessionPin ? "Ex.: 1234" : "PIN opcional"}
                  value={openTableForm.pinCode}
                  onChange={(event) => setOpenTableForm((prev) => ({ ...prev, pinCode: event.target.value }))}
                  disabled={!allowSessionPin}
                  maxLength={4}
                />
              </AppFormField>

              <div className="md:col-span-2">
                <AppFormField label="Observações operacionais" hint="Opcional: use para comunicar alguma informação para a equipe.">
                  <AppTextarea
                    value={openTableForm.operationalNotes}
                    onChange={(event) => setOpenTableForm((prev) => ({ ...prev, operationalNotes: event.target.value }))}
                    placeholder="Ex.: cliente com criança, alergia informada, prioridade no atendimento..."
                  />
                </AppFormField>
              </div>

              <div className="md:col-span-2 flex justify-end gap-2 border-t border-[hsl(var(--border))] pt-3">
                <AppActionButton variant="secondary" onClick={() => setOpenModalVisible(false)}>
                  Cancelar
                </AppActionButton>
                <AppActionButton type="submit" className="gap-2" disabled={Boolean(openingTableId)}>
                  {openingTableId ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Confirmar abertura
                </AppActionButton>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {detailsTable ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <div className="app-surface-strong w-full max-w-3xl space-y-4 rounded-2xl p-5">
            <header className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--foreground-muted))]">Detalhes da mesa</p>
                <h3 className="text-xl font-semibold">{detailsTable.label} · Mesa {detailsTable.number}</h3>
              </div>
              <button type="button" onClick={() => setDetailsModalTableId(null)} className="rounded-lg p-1 text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--surface-muted))]">
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <AppDataCard title="Status da mesa" status={<AppStatusBadge tone={tableStatusStyles[detailsTable.status].tone}>{tableStatusLabels[detailsTable.status]}</AppStatusBadge>} />
              <AppDataCard title="Pessoas na mesa" metadata={`${detailsTable.currentPeopleCount} de ${detailsTable.capacity}`} />
              <AppDataCard title="Sessões ativas" metadata={`${(sessionsByTable[detailsTable.id] ?? []).length} sessão(ões)`} />
              <AppDataCard title="Horário de abertura" metadata={detailsTable.openedAt ? formatDateTime(detailsTable.openedAt) : "Mesa ainda não aberta"} />
              <AppDataCard title="QR vinculado" metadata={detailsTable.qrCodeValue} />
              <AppDataCard title="Limite de sessões" metadata={`${detailsTable.activeSessionLimit} simultânea(s)`} />
            </div>

            {qrPreview ? (
              <AppSurface className="flex flex-col items-center gap-3 bg-[radial-gradient(circle_at_top,#ffffff,#f7f7fb)] p-4">
                <div className="rounded-2xl border border-[hsl(var(--border-strong))] bg-white p-3 shadow-sm">
                  <img src={qrPreview} alt={`QR ${detailsTable.label}`} className="h-44 w-44 rounded-xl border border-[hsl(var(--border-strong))] bg-white p-2" />
                </div>
                <p className="text-sm font-medium">{detailsTable.label} · Mesa {detailsTable.number}</p>
                <p className="text-xs text-[hsl(var(--foreground-muted))]">QR pronto para visualização e base para impressão operacional.</p>
                <AppActionButton
                  variant="secondary"
                  className="h-9"
                  onClick={() => window.print()}
                  aria-label="Imprimir QR da mesa"
                >
                  Imprimir QR
                </AppActionButton>
              </AppSurface>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <AppSurface className="space-y-3 p-4">
                <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-[hsl(var(--foreground-muted))]">Pedidos ativos relacionados</h4>
                {(ordersByTable[detailsTable.id] ?? []).length > 0 ? (
                  <ul className="space-y-2 text-sm">
                    {(ordersByTable[detailsTable.id] ?? []).slice(0, 5).map((order) => (
                      <li key={order.id} className="rounded-xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))] px-3 py-2">
                        Pedido #{order.id.slice(0, 6)} • {order.items.length} item(ns)
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[hsl(var(--foreground-muted))]">Nenhum pedido ativo para esta mesa no momento.</p>
                )}
              </AppSurface>

              <AppSurface className="space-y-3 p-4">
                <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-[hsl(var(--foreground-muted))]">Sinais operacionais</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))] px-3 py-2">
                    <span className="flex items-center gap-2 text-sm">
                      <AlertCircle className="h-4 w-4" /> Chamada de garçom pendente
                    </span>
                    <AppStatusBadge tone="neutral">Preparado</AppStatusBadge>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))] px-3 py-2">
                    <span className="flex items-center gap-2 text-sm">
                      <CreditCard className="h-4 w-4" /> Pedido de conta pendente
                    </span>
                    <AppStatusBadge tone={detailsTable.status === "awaiting_payment" ? "warning" : "neutral"}>
                      {detailsTable.status === "awaiting_payment" ? "Pendente" : "Sem pendência"}
                    </AppStatusBadge>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))] px-3 py-2">
                    <span className="flex items-center gap-2 text-sm">
                      <Search className="h-4 w-4" /> Ação de geração de QR Code
                    </span>
                    <AppActionButton variant="secondary" className="h-8 px-3 text-xs">
                      Preparar
                    </AppActionButton>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))] px-3 py-2">
                    <span className="flex items-center gap-2 text-sm">
                      {detailsTable.pinCode ? <Lock className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />} PIN de acesso
                    </span>
                    <AppStatusBadge tone={detailsTable.pinCode ? "info" : "neutral"}>{detailsTable.pinCode ? "Definido" : "Não usado"}</AppStatusBadge>
                  </div>
                </div>
              </AppSurface>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
