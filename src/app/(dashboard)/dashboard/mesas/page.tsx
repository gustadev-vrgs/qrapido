"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  DoorClosed,
  DoorOpen,
  KeyRound,
  Loader2,
  Download,
  Edit2,
  Plus,
  Trash2,
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
import { getFirebaseClientAuth } from "@/lib/firebase/client";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import type { Order, Table, TableSession, TableStatus } from "@/lib/types/domain";
import { formatDateTime } from "@/lib/utils/formatters";
import { createQrDataUrl } from "@/lib/utils/qr";
import { buildPublicTableUrl, resolvePublicTableUrl } from "@/lib/utils/public-url";
import { appToast } from "@/lib/utils/toast";

const TABLE_STATUS_FILTERS: Array<{ value: "all" | TableStatus; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "free", label: "Livres" },
  { value: "active", label: "Ativas" },
  { value: "awaiting_payment", label: "Pagamento" },
  { value: "closed", label: "Encerradas" },
  { value: "blocked", label: "Bloqueadas" }
];


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

interface TableFormState {
  id: string;
  number: string;
  label: string;
  capacity: string;
  activeSessionLimit: string;
  pinCode: string;
}

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

const defaultTableFormState: TableFormState = { id: "", number: "", label: "", capacity: "4", activeSessionLimit: "1", pinCode: "" };

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

function createClientToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("");
}


export default function MesasPage(): JSX.Element {
  const { firebaseUser, user } = useAdminAuth();
  const canManageTables = user?.role === "admin" || user?.role === "manager";
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tables, setTables] = useState<Table[]>([]);
  const [sessionsByTable, setSessionsByTable] = useState<Record<string, TableSession[]>>({});
  const [ordersByTable, setOrdersByTable] = useState<Record<string, Order[]>>({});
  const [allowSessionPin, setAllowSessionPin] = useState(false);

  const [statusFilter, setStatusFilter] = useState<"all" | TableStatus>("all");
  const [tableFormVisible, setTableFormVisible] = useState(false);
  const [savingTable, setSavingTable] = useState(false);
  const [tableForm, setTableForm] = useState<TableFormState>(defaultTableFormState);
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

      const orderMap = ordersData.reduce<Record<string, Order[]>>((acc, order) => {
        acc[order.tableId] = [...(acc[order.tableId] ?? []), order];
        return acc;
      }, {});

      setTables(tablesData);
      setSessionsByTable(sessionMap);
      setOrdersByTable(orderMap);
      setAllowSessionPin(Boolean(settingsData[0]?.allowSessionPin));
    } catch (error) {
      if (process.env.NODE_ENV === "development") console.error(error);
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

  const filteredTables = useMemo(
    () => tables.filter((table) => statusFilter === "all" || table.status === statusFilter),
    [statusFilter, tables]
  );

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

  const publicUrlFor = useCallback((table: Table): string => resolvePublicTableUrl(table), []);

  const getAdminIdToken = useCallback(async (forceRefresh = false): Promise<string | null> => {
    const authUser = firebaseUser ?? getFirebaseClientAuth().currentUser;
    return authUser ? authUser.getIdToken(forceRefresh) : null;
  }, [firebaseUser]);

  const fetchAdminJson = useCallback(async (url: string, payload: Record<string, unknown>): Promise<Response> => {
    const token = await getAdminIdToken();
    if (!token) throw new Error("Sessão administrativa ausente. Faça login novamente.");

    const request = (idToken: string) => fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${idToken}` },
      body: JSON.stringify(payload)
    });

    const response = await request(token);
    if (response.status !== 401) return response;

    const refreshedToken = await getAdminIdToken(true);
    return refreshedToken ? request(refreshedToken) : response;
  }, [getAdminIdToken]);

  async function readApiError(response: Response, fallback: string): Promise<string> {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    if (payload?.error) return payload.error;

    if (response.status === 401) return "Sua sessão expirou. Faça login novamente.";
    if (response.status === 403) return "Você não possui permissão para abrir atendimentos.";
    if (response.status === 404) return "Mesa não encontrada.";
    if (response.status === 409) return "Esta mesa já possui atendimento aberto.";
    if (response.status === 500) return "Não foi possível abrir o atendimento. Tente novamente.";

    return fallback;
  }

  const handleNewTable = () => {
    setTableForm(defaultTableFormState);
    setTableFormVisible(true);
  };

  const handleEditTable = (table: Table) => {
    setTableForm({
      id: table.id,
      number: String(table.number),
      label: table.label,
      capacity: String(table.capacity),
      activeSessionLimit: String(table.activeSessionLimit),
      pinCode: table.pinCode ?? ""
    });
    setTableFormVisible(true);
  };

  const submitTableForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?.restaurantId) return;
    const number = Number(tableForm.number);
    const capacity = Number(tableForm.capacity);
    const activeSessionLimit = Number(tableForm.activeSessionLimit);
    const pinCode = tableForm.pinCode.trim() || null;
    if (!Number.isInteger(number) || number < 1 || !Number.isInteger(capacity) || capacity < 1) {
      appToast.error("Dados inválidos", "Informe número e capacidade válidos.");
      return;
    }
    if (!Number.isInteger(activeSessionLimit) || activeSessionLimit < 1 || activeSessionLimit > 40) {
      appToast.error("Limite inválido", "Informe um limite de sessões entre 1 e 40.");
      return;
    }
    if (pinCode && !/^\d{4}$/.test(pinCode)) {
      appToast.error("PIN inválido", "Use 4 dígitos numéricos.");
      return;
    }
    try {
      setSavingTable(true);
      if (tableForm.id) {
        await tablesService.update(tableForm.id, { number, label: tableForm.label.trim() || `Mesa ${number}`, capacity, activeSessionLimit, pinCode });
        appToast.success("Mesa atualizada", "Os dados da mesa foram salvos.");
      } else {
        const publicToken = createClientToken();
        const qrCodeValue = buildPublicTableUrl(publicToken);
        await tablesService.create({
          restaurantId: user.restaurantId,
          number,
          label: tableForm.label.trim() || `Mesa ${number}`,
          status: "free",
          capacity,
          currentPeopleCount: 0,
          activeSessionLimit,
          activeSessionCount: 0,
          currentSessionGroupId: null,
          pinCode,
          publicToken,
          isActive: true,
          qrCodeValue,
          openedAt: null,
          closedAt: null
        });
        appToast.success("Mesa criada", "QR Code público gerado para a mesa.");
      }
      setTableFormVisible(false);
      await loadData(true);
    } catch (error) {
      if (process.env.NODE_ENV === "development") console.error(error);
      appToast.error("Falha ao salvar mesa", "Verifique os dados e tente novamente.");
    } finally {
      setSavingTable(false);
    }
  };

  const toggleTableActive = async (table: Table) => {
    if (!confirm(`${table.isActive === false ? "Ativar" : "Desativar"} mesa ${table.number}?`)) return;
    await tablesService.update(table.id, { isActive: table.isActive === false, status: table.isActive === false ? "free" : "blocked" });
    await loadData(true);
  };

  const deleteTable = async (table: Table) => {
    if ((sessionsByTable[table.id] ?? []).length > 0 || table.status === "active") {
      appToast.error("Exclusão bloqueada", "Encerre o atendimento ativo antes de excluir a mesa.");
      return;
    }
    if (!confirm(`Excluir definitivamente a mesa ${table.number}?`)) return;
    await tablesService.delete(table.id);
    appToast.success("Mesa excluída", "A mesa foi removida do cadastro.");
    await loadData(true);
  };

  const downloadQr = (table: Table) => {
    void createQrDataUrl(publicUrlFor(table)).then((dataUrl) => {
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `mesa-${table.number}-qrcode.png`;
      link.click();
    });
  };


  const printQr = (table: Table) => {
    void createQrDataUrl(publicUrlFor(table)).then((dataUrl) => {
      const frame = document.createElement("iframe");
      frame.title = `Impressão QR ${table.label}`;
      frame.style.position = "fixed";
      frame.style.right = "0";
      frame.style.bottom = "0";
      frame.style.width = "0";
      frame.style.height = "0";
      frame.style.border = "0";
      document.body.appendChild(frame);

      const doc = frame.contentDocument ?? frame.contentWindow?.document;
      if (!doc) {
        document.body.removeChild(frame);
        appToast.error("Falha ao imprimir QR", "Não foi possível preparar a página de impressão.");
        return;
      }

      doc.open();
      doc.write(`<!doctype html>
<html>
  <head>
    <title>QR Code ${table.label}</title>
    <style>
      @page { size: A4; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 210mm; height: 297mm; }
      body { display: flex; align-items: center; justify-content: center; background: #fff; }
      img { display: block; width: 120mm; height: 120mm; object-fit: contain; }
    </style>
  </head>
  <body><img src="${dataUrl}" alt="QR Code" /></body>
</html>`);
      doc.close();

      const printFrame = () => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        window.setTimeout(() => frame.remove(), 1000);
      };

      const image = doc.querySelector("img");
      if (image?.complete) {
        printFrame();
      } else if (image) {
        image.onload = printFrame;
        image.onerror = () => {
          frame.remove();
          appToast.error("Falha ao imprimir QR", "Não foi possível carregar a imagem do QR Code.");
        };
      } else {
        printFrame();
      }
    });
  };

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
      const response = await fetchAdminJson("/api/admin/table/close", { tableId: table.id });
      if (!response.ok) throw new Error(await readApiError(response, "Não foi possível encerrar a mesa."));
      appToast.success("Atendimento encerrado", "A mesa voltou ao status disponível.");
      await loadData(true);
    } catch (error) {
      if (process.env.NODE_ENV === "development") console.error(error);
      appToast.error("Falha ao encerrar mesa", error instanceof Error ? error.message : "Tente novamente em instantes.");
    } finally {
      setClosingTableId(null);
    }
  };

  const submitOpenTable = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (openingTableId) return;

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

    try {
      setOpeningTableId(table.id);
      const response = await fetchAdminJson("/api/admin/table/open", {
        tableId: table.id,
        label: openTableForm.label.trim() || table.label,
        number: Number(openTableForm.number) || table.number,
        capacity,
        currentPeopleCount,
        activeSessionLimit,
        pinCode: null,
        notes: openTableForm.operationalNotes.trim() || undefined
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Falha ao abrir mesa"));
      }

      const opened = await response.json() as { attendanceCode: string };
      appToast.success("Mesa aberta com sucesso", `Código temporário: ${opened.attendanceCode}. Informe-o presencialmente aos clientes.`);
      if (openTableForm.operationalNotes.trim()) {
        appToast.info("Observação operacional registrada no fluxo", openTableForm.operationalNotes.trim());
      }
      setOpenModalVisible(false);
      setOpenTableForm(defaultFormState);
      await loadData(true);
    } catch (error) {
      if (process.env.NODE_ENV === "development") console.error(error);
      appToast.error("Falha ao abrir mesa", error instanceof Error ? error.message : "Não foi possível abrir o atendimento. Tente novamente.");
    } finally {
      setOpeningTableId(null);
    }
  };

  useEffect(() => {
    if (!detailsTable?.qrCodeValue) {
      setQrPreview(null);
      return;
    }

    void createQrDataUrl(publicUrlFor(detailsTable))
      .then(setQrPreview)
      .catch(() => setQrPreview(null));
  }, [detailsTable, publicUrlFor]);

  const renderTableCardActions = (table: Table) => {
    const isOpening = openingTableId === table.id;
    const isClosing = closingTableId === table.id;

    return (
      <div className="flex flex-wrap gap-2">
        {canManageTables && (table.status === "free" || table.status === "closed") && (
          <AppActionButton variant="primary" onClick={() => handleOpenModal(table)} disabled={isOpening} className="gap-2">
            {isOpening ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorOpen className="h-4 w-4" />}
            Abrir mesa
          </AppActionButton>
        )}

        {canManageTables && (table.status === "active" || table.status === "awaiting_payment") && (
          <AppActionButton variant="destructive" onClick={() => void handleCloseTable(table)} disabled={isClosing} className="gap-2">
            {isClosing ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorClosed className="h-4 w-4" />}
            Encerrar mesa
          </AppActionButton>
        )}

        <AppActionButton variant="secondary" onClick={() => setDetailsModalTableId(table.id)}>Detalhes</AppActionButton>
        {canManageTables ? <><AppActionButton variant="secondary" onClick={() => handleEditTable(table)} className="gap-2"><Edit2 className="h-4 w-4" />Editar</AppActionButton>
        <AppActionButton variant="secondary" onClick={() => void toggleTableActive(table)}>{table.isActive === false ? "Ativar" : "Desativar"}</AppActionButton>
        <AppActionButton variant="ghost" onClick={() => void deleteTable(table)} className="gap-2 text-[hsl(var(--danger))]"><Trash2 className="h-4 w-4" />Excluir</AppActionButton></> : null}
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

      <AppFilterBar className="items-center gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {TABLE_STATUS_FILTERS.map((filter) => (
            <button
              type="button"
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={`h-9 whitespace-nowrap rounded-full border px-4 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                statusFilter === filter.value
                  ? "border-[hsl(var(--focus-ring)/0.45)] bg-[hsl(var(--primary)/0.2)] text-[hsl(var(--foreground))]"
                  : "border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))] text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--foreground))]"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="flex w-full shrink-0 gap-2 sm:w-auto sm:justify-end">
          {canManageTables ? <AppActionButton variant="primary" onClick={handleNewTable} className="min-w-32 flex-1 gap-2 whitespace-nowrap sm:flex-none">
            <Plus className="h-4 w-4" />
            <span>Nova mesa</span>
          </AppActionButton> : null}
          <AppActionButton variant="secondary" onClick={() => void loadData(true)} className="min-w-28 flex-1 whitespace-nowrap sm:flex-none" disabled={isRefreshing}>
            {isRefreshing ? "Atualizando..." : "Atualizar"}
          </AppActionButton>
        </div>
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
            title={tables.length === 0 ? "Nenhuma mesa cadastrada" : "Nenhuma mesa encontrada para este filtro"}
            description={
              tables.length === 0
                ? "Cadastre mesas para iniciar a operação. Assim que forem criadas, aparecerão neste mapa em tempo real."
                : "Ajuste o status para visualizar as mesas do salão."
            }
            action={
              <AppActionButton
                variant="secondary"
                onClick={() => {
                  setStatusFilter("all");
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
                      Pedidos na sessão: {activeOrders.length}
                    </p>
                    <p className="flex min-w-0 items-start gap-2">
                      <QrCode className="mt-0.5 h-4 w-4 shrink-0" />
                      <span className="min-w-0 break-all">QR: {publicUrlFor(table)}</span>
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

      {canManageTables && tableFormVisible ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={submitTableForm} className="app-surface-strong w-full max-w-lg space-y-4 rounded-2xl p-5">
            <header className="flex items-start justify-between"><div><p className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--foreground-muted))]">Cadastro de mesa</p><h3 className="text-xl font-semibold">{tableForm.id ? "Editar mesa" : "Nova mesa"}</h3></div><button type="button" onClick={() => setTableFormVisible(false)}><X className="h-5 w-5" /></button></header>
            <div className="grid gap-4 md:grid-cols-2">
              <AppFormField label="Número da mesa"><AppTextInput type="number" min={1} value={tableForm.number} onChange={(event) => setTableForm((prev) => ({ ...prev, number: event.target.value }))} required /></AppFormField>
              <AppFormField label="Capacidade"><AppTextInput type="number" min={1} max={20} value={tableForm.capacity} onChange={(event) => setTableForm((prev) => ({ ...prev, capacity: event.target.value }))} required /></AppFormField>
              <AppFormField label="Limite de sessões"><AppTextInput type="number" min={1} max={40} value={tableForm.activeSessionLimit} onChange={(event) => setTableForm((prev) => ({ ...prev, activeSessionLimit: event.target.value }))} required /></AppFormField>
              <AppFormField label="PIN de acesso" hint="Opcional: 4 dígitos."><AppTextInput inputMode="numeric" maxLength={4} value={tableForm.pinCode} onChange={(event) => setTableForm((prev) => ({ ...prev, pinCode: event.target.value.replace(/\D/g, "").slice(0, 4) }))} placeholder="Ex.: 1234" /></AppFormField>
              <div className="md:col-span-2"><AppFormField label="Nome ou identificação"><AppTextInput value={tableForm.label} onChange={(event) => setTableForm((prev) => ({ ...prev, label: event.target.value }))} placeholder="Ex.: Varanda 5" /></AppFormField></div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[hsl(var(--border))] pt-3"><AppActionButton variant="secondary" onClick={() => setTableFormVisible(false)}>Cancelar</AppActionButton><AppActionButton type="submit" disabled={savingTable}>{savingTable ? "Salvando..." : "Salvar mesa"}</AppActionButton></div>
          </form>
        </div>
      ) : null}

      {canManageTables && openModalVisible ? (
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

              <AppSurface className="p-3 text-sm text-[hsl(var(--foreground-muted))]">
                Ao abrir, será gerado um novo código temporário de 6 dígitos. Informe-o presencialmente aos clientes; ele não faz parte do QR fixo.
              </AppSurface>

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
                <AppActionButton variant="secondary" onClick={() => setOpenModalVisible(false)} disabled={Boolean(openingTableId)}>
                  Cancelar
                </AppActionButton>
                <AppActionButton type="submit" className="gap-2" disabled={Boolean(openingTableId)}>
                  {openingTableId ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {openingTableId ? "Abrindo..." : "Confirmar abertura"}
                </AppActionButton>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {detailsTable ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="app-surface-strong max-h-[calc(100vh-2rem)] w-full max-w-3xl space-y-4 overflow-y-auto rounded-2xl p-5">
            <header className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--foreground-muted))]">Detalhes da mesa</p>
                <h3 className="text-xl font-semibold">{detailsTable.label} · Mesa {detailsTable.number}</h3>
              </div>
              <div className="flex items-center gap-2">
                <AppActionButton variant="secondary" className="h-9" onClick={() => setDetailsModalTableId(null)}>
                  Voltar
                </AppActionButton>
                <button type="button" onClick={() => setDetailsModalTableId(null)} className="rounded-lg p-1 text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--surface-muted))]" aria-label="Fechar detalhes da mesa">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </header>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <AppDataCard title="Status da mesa" status={<AppStatusBadge tone={tableStatusStyles[detailsTable.status].tone}>{tableStatusLabels[detailsTable.status]}</AppStatusBadge>} />
              <AppDataCard title="Pessoas na mesa" metadata={`${detailsTable.currentPeopleCount} de ${detailsTable.capacity}`} />
              <AppDataCard title="Sessões ativas" metadata={`${(sessionsByTable[detailsTable.id] ?? []).length} sessão(ões)`} />
              <AppDataCard title="Horário de abertura" metadata={detailsTable.openedAt ? formatDateTime(detailsTable.openedAt) : "Mesa ainda não aberta"} />
              <AppDataCard title="QR vinculado"><p className="break-all text-sm text-[hsl(var(--foreground-muted))]">{publicUrlFor(detailsTable)}</p></AppDataCard>
              <AppDataCard title="Limite de sessões" metadata={`${detailsTable.activeSessionLimit} simultânea(s)`} />
            </div>

            {qrPreview ? (
              <AppSurface className="flex flex-col items-center gap-3 bg-[radial-gradient(circle_at_top,#ffffff,#f7f7fb)] p-4">
                <div className="rounded-2xl border border-[hsl(var(--border-strong))] bg-white p-3 shadow-sm">
                  <Image src={qrPreview} alt={`QR ${detailsTable.label}`} width={176} height={176} className="h-44 w-44 rounded-xl border border-[hsl(var(--border-strong))] bg-white p-2" unoptimized />
                </div>
                <p className="text-sm font-medium">{detailsTable.label} · Mesa {detailsTable.number}</p>
                <p className="text-xs text-[hsl(var(--foreground-muted))]">QR pronto para visualização e base para impressão operacional.</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <AppActionButton variant="secondary" className="h-9 gap-2" onClick={() => downloadQr(detailsTable)}>
                    <Download className="h-4 w-4" />
                    Baixar QR
                  </AppActionButton>
                  <AppActionButton variant="secondary" className="h-9" onClick={() => printQr(detailsTable)} aria-label="Imprimir somente o QR Code da mesa">
                    Imprimir QR
                  </AppActionButton>
                </div>
              </AppSurface>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <AppSurface className="space-y-3 p-4">
                <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-[hsl(var(--foreground-muted))]">Pedidos relacionados</h4>
                {(ordersByTable[detailsTable.id] ?? []).length > 0 ? (
                  <ul className="space-y-2 text-sm">
                    {(ordersByTable[detailsTable.id] ?? []).slice(0, 5).map((order) => (
                      <li key={order.id} className="rounded-xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))] px-3 py-2">
                        Pedido #{order.id.slice(0, 6)} • {order.items.length} item(ns)
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[hsl(var(--foreground-muted))]">Nenhum pedido registrado para esta mesa no momento.</p>
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
