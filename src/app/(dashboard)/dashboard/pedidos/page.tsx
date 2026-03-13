"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, CircleDashed, ClipboardList, Loader2, RefreshCw, Search, XCircle } from "lucide-react";

import {
  AppActionButton,
  AppEmptyState,
  AppFilterBar,
  AppSearchInput,
  AppSectionCard,
  AppSelect,
  AppSkeleton,
  AppStatusBadge,
  AppSurface,
  AppTextarea
} from "@/components/ui/app-design-system";
import { orderStatusLabels, paymentMethodLabels } from "@/lib/constants/status-labels";
import { OrdersService } from "@/lib/data/services/orders-service";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import type { Order, OrderStatus } from "@/lib/types/domain";
import { formatCurrency, formatDateTime, formatTime } from "@/lib/utils/formatters";
import { appToast } from "@/lib/utils/toast";

const EXPECTED_STATUSES: OrderStatus[] = ["received", "in_preparation", "ready", "delivered", "cancelled"];

type StatusFilter = "all" | OrderStatus;

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "received", label: "Recebidos" },
  { value: "in_preparation", label: "Em preparo" },
  { value: "ready", label: "Prontos" },
  { value: "delivered", label: "Entregues" },
  { value: "cancelled", label: "Cancelados" }
];

const STATUS_TONE: Record<OrderStatus, "info" | "warning" | "success" | "neutral" | "danger"> = {
  received: "info",
  confirmed: "info",
  in_preparation: "warning",
  ready: "success",
  delivered: "neutral",
  cancelled: "danger"
};

const NEXT_STATUS_OPTIONS: Record<OrderStatus, OrderStatus[]> = {
  received: ["in_preparation", "cancelled"],
  confirmed: ["in_preparation", "cancelled"],
  in_preparation: ["ready", "cancelled"],
  ready: ["delivered", "cancelled"],
  delivered: [],
  cancelled: []
};

function isImportantNote(note: string | null): boolean {
  if (!note) return false;
  const normalized = note.toLowerCase();
  return ["alerg", "urg", "sem", "aten", "ráp", "rap"].some((token) => normalized.includes(token));
}

function resolveSessionLabel(order: Order): string {
  return order.sessionToken || order.sessionId;
}

interface OrderQuickCardProps {
  order: Order;
  isUpdating: boolean;
  onOpenDetails: (order: Order) => void;
  onAdvanceStatus: (order: Order, nextStatus: OrderStatus) => void;
  onCancel: (order: Order) => void;
}

function OrderQuickCard({ order, isUpdating, onOpenDetails, onAdvanceStatus, onCancel }: OrderQuickCardProps): JSX.Element {
  const nextSteps = NEXT_STATUS_OPTIONS[order.status];
  const relevantNextStatus = nextSteps.find((step) => step !== "cancelled") ?? null;
  const importantNotes = isImportantNote(order.notes);

  return (
    <AppSurface className="space-y-4 border border-[hsl(var(--border-strong))] p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--foreground-muted))]">Pedido #{order.id.slice(-6).toUpperCase()}</p>
          <h3 className="text-lg font-semibold">Mesa {order.tableNumber} • {order.customerName || "Cliente não identificado"}</h3>
          <p className="text-xs text-[hsl(var(--foreground-muted))]">Sessão {resolveSessionLabel(order)} • {formatTime(order.receivedAt)}</p>
        </div>

        <div className="flex items-center gap-2">
          <AppStatusBadge tone={STATUS_TONE[order.status]}>{orderStatusLabels[order.status]}</AppStatusBadge>
          <AppActionButton variant="ghost" className="gap-1" onClick={() => onOpenDetails(order)}>
            Detalhes
            <ChevronRight className="h-4 w-4" />
          </AppActionButton>
        </div>
      </div>

      <div className="space-y-2">
        {order.items.map((item) => (
          <div key={`${order.id}-${item.menuItemId}-${item.nameSnapshot}`} className="flex items-start justify-between gap-4 rounded-lg border border-[hsl(var(--border))] px-3 py-2">
            <div>
              <p className="text-sm font-medium">{item.quantity}x {item.nameSnapshot}</p>
              {item.notes ? <p className="text-xs text-[hsl(var(--foreground-muted))]">Obs. item: {item.notes}</p> : null}
            </div>
            <p className="text-sm text-[hsl(var(--foreground-muted))]">{formatCurrency(item.total)}</p>
          </div>
        ))}
      </div>

      {order.notes ? (
        <div
          className={`rounded-xl border px-3 py-2 text-sm ${
            importantNotes
              ? "border-[hsl(var(--warning)/0.45)] bg-[hsl(var(--warning)/0.12)] text-[hsl(var(--foreground))]"
              : "border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] text-[hsl(var(--foreground-muted))]"
          }`}
        >
          <span className="font-medium">Observações:</span> {order.notes}
        </div>
      ) : null}

      <div className="grid gap-2 text-sm text-[hsl(var(--foreground-muted))] md:grid-cols-4">
        <p>Subtotal: <span className="font-medium text-[hsl(var(--foreground))]">{formatCurrency(order.subtotal)}</span></p>
        <p>Total: <span className="font-medium text-[hsl(var(--foreground))]">{formatCurrency(order.total)}</span></p>
        <p>Pagamento: <span className="font-medium text-[hsl(var(--foreground))]">{paymentMethodLabels[order.paymentMethod]}</span></p>
        <p>Criado em: <span className="font-medium text-[hsl(var(--foreground))]">{formatDateTime(order.createdAt)}</span></p>
      </div>

      <div className="flex flex-wrap gap-2">
        {relevantNextStatus ? (
          <AppActionButton
            variant="primary"
            onClick={() => onAdvanceStatus(order, relevantNextStatus)}
            disabled={isUpdating}
            className="gap-2"
          >
            {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleDashed className="h-4 w-4" />}
            Mover para {orderStatusLabels[relevantNextStatus]}
          </AppActionButton>
        ) : (
          <AppActionButton variant="secondary" disabled>
            Fluxo concluído
          </AppActionButton>
        )}

        {NEXT_STATUS_OPTIONS[order.status].includes("cancelled") ? (
          <AppActionButton variant="destructive" onClick={() => onCancel(order)} disabled={isUpdating} className="gap-2">
            <XCircle className="h-4 w-4" />
            Cancelar pedido
          </AppActionButton>
        ) : null}
      </div>
    </AppSurface>
  );
}

interface CancelDialogState {
  order: Order;
  reason: string;
}

export default function PedidosPage(): JSX.Element {
  const { user } = useAdminAuth();
  const ordersService = useMemo(() => new OrdersService({ scope: "admin" }), []);

  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [cancelDialog, setCancelDialog] = useState<CancelDialogState | null>(null);

  const loadOrders = async (refreshing = false) => {
    if (!user?.restaurantId) return;

    if (refreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const data = await ordersService.listByRestaurant(user.restaurantId);
      setOrders(data);
    } catch (error) {
      console.error(error);
      appToast.error("Falha ao carregar pedidos", "Verifique conexão e permissões da conta administrativa.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.restaurantId]);

  const filteredOrders = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();

    return orders
      .filter((order) => (statusFilter === "all" ? true : order.status === statusFilter))
      .filter((order) => {
        if (!normalized) return true;

        const byOrderId = order.id.toLowerCase().includes(normalized);
        const byTable = String(order.tableNumber).includes(normalized);
        const byCustomer = (order.customerName || "").toLowerCase().includes(normalized);

        return byOrderId || byTable || byCustomer;
      });
  }, [orders, searchTerm, statusFilter]);

  const summary = useMemo(() => {
    const inFlow = orders.filter((order) => EXPECTED_STATUSES.includes(order.status));
    const received = inFlow.filter((order) => order.status === "received").length;
    const preparing = inFlow.filter((order) => order.status === "in_preparation").length;
    const ready = inFlow.filter((order) => order.status === "ready").length;

    return {
      total: inFlow.length,
      received,
      preparing,
      ready,
      cancelled: inFlow.filter((order) => order.status === "cancelled").length
    };
  }, [orders]);

  const updateOrderStatus = async (order: Order, nextStatus: OrderStatus, reason?: string) => {
    if (order.status === nextStatus) return;

    try {
      setUpdatingOrderId(order.id);

      await ordersService.update(order.id, {
        status: nextStatus,
        cancelledAt: nextStatus === "cancelled" ? new Date().toISOString() : null,
        deliveredAt: nextStatus === "delivered" ? new Date().toISOString() : order.deliveredAt,
        notes: nextStatus === "cancelled" && reason ? `${order.notes ? `${order.notes} • ` : ""}Cancelado: ${reason}` : order.notes
      });

      setOrders((previous) =>
        previous.map((item) =>
          item.id === order.id
            ? {
                ...item,
                status: nextStatus,
                cancelledAt: nextStatus === "cancelled" ? new Date().toISOString() : null,
                deliveredAt: nextStatus === "delivered" ? new Date().toISOString() : item.deliveredAt,
                notes: nextStatus === "cancelled" && reason ? `${item.notes ? `${item.notes} • ` : ""}Cancelado: ${reason}` : item.notes,
                updatedAt: new Date().toISOString()
              }
            : item
        )
      );

      appToast.success("Status atualizado", `Pedido movido para ${orderStatusLabels[nextStatus]}.`);
      appToast.info("Evento operacional", "Alteração preparada para integração de log em tempo real nas próximas etapas.");
      if (selectedOrder?.id === order.id) {
        setSelectedOrder((current) => (current ? { ...current, status: nextStatus } : null));
      }
    } catch (error) {
      console.error(error);
      appToast.error("Não foi possível atualizar o status", "Tente novamente em instantes.");
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const confirmCancellation = async () => {
    if (!cancelDialog) return;

    const reason = cancelDialog.reason.trim();
    if (reason.length < 4) {
      appToast.error("Motivo obrigatório", "Informe um motivo com pelo menos 4 caracteres para cancelar o pedido.");
      return;
    }

    await updateOrderStatus(cancelDialog.order, "cancelled", reason);
    setCancelDialog(null);
  };

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AppSurface className="p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--foreground-muted))]">Pedidos no turno</p>
          <p className="mt-2 text-2xl font-semibold">{summary.total}</p>
        </AppSurface>
        <AppSurface className="p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--foreground-muted))]">Recebidos</p>
          <p className="mt-2 text-2xl font-semibold text-[hsl(var(--info))]">{summary.received}</p>
        </AppSurface>
        <AppSurface className="p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--foreground-muted))]">Em preparo</p>
          <p className="mt-2 text-2xl font-semibold text-[hsl(var(--warning))]">{summary.preparing}</p>
        </AppSurface>
        <AppSurface className="p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--foreground-muted))]">Prontos para entrega</p>
          <p className="mt-2 text-2xl font-semibold text-[hsl(var(--success))]">{summary.ready}</p>
        </AppSurface>
      </div>

      <AppFilterBar className="gap-2 md:flex-wrap">
        <AppSearchInput
          className="flex-1"
          placeholder="Buscar por mesa, cliente ou nº pedido"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />

        <div className="flex min-w-[220px] items-center gap-2">
          <Search className="h-4 w-4 text-[hsl(var(--foreground-muted))]" />
          <AppSelect value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
            {STATUS_FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>{filter.label}</option>
            ))}
          </AppSelect>
        </div>

        <AppActionButton variant="secondary" onClick={() => void loadOrders(true)} disabled={isRefreshing} className="gap-2">
          {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </AppActionButton>
      </AppFilterBar>

      <AppSectionCard
        title="Fila operacional de pedidos"
        description="Leitura rápida por cartões, com ações diretas de status e cancelamento protegido por confirmação."
        action={<AppStatusBadge tone="warning">{summary.cancelled} cancelados</AppStatusBadge>}
      >
        {isLoading ? (
          <div className="space-y-3">
            <AppSkeleton className="h-40 w-full" />
            <AppSkeleton className="h-40 w-full" />
            <AppSkeleton className="h-40 w-full" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <AppEmptyState
            title="Nenhum pedido encontrado"
            description="Ajuste os filtros ou aguarde novos pedidos. O painel está pronto para operar em tempo real nas próximas etapas."
          />
        ) : (
          <div className="space-y-3">
            {filteredOrders.map((order) => (
              <OrderQuickCard
                key={order.id}
                order={order}
                isUpdating={updatingOrderId === order.id}
                onOpenDetails={setSelectedOrder}
                onAdvanceStatus={(currentOrder, nextStatus) => void updateOrderStatus(currentOrder, nextStatus)}
                onCancel={(currentOrder) => setCancelDialog({ order: currentOrder, reason: "" })}
              />
            ))}
          </div>
        )}
      </AppSectionCard>

      {selectedOrder ? (
        <div className="fixed inset-0 z-40 bg-black/40 p-4" onClick={() => setSelectedOrder(null)} role="presentation">
          <aside
            className="ml-auto h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--background-elevated))] p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--foreground-muted))]">Detalhes completos</p>
                <h3 className="text-xl font-semibold">Pedido #{selectedOrder.id.slice(-6).toUpperCase()}</h3>
                <p className="text-sm text-[hsl(var(--foreground-muted))]">Mesa {selectedOrder.tableNumber} • Sessão {resolveSessionLabel(selectedOrder)}</p>
              </div>
              <AppActionButton variant="ghost" onClick={() => setSelectedOrder(null)}>Fechar</AppActionButton>
            </div>

            <div className="space-y-4">
              <AppSurface className="space-y-2 p-4">
                <p><strong>Cliente:</strong> {selectedOrder.customerName || "Não informado"}</p>
                <p><strong>Status:</strong> {orderStatusLabels[selectedOrder.status]}</p>
                <p><strong>Pagamento:</strong> {paymentMethodLabels[selectedOrder.paymentMethod]}</p>
                <p><strong>Criado em:</strong> {formatDateTime(selectedOrder.createdAt)}</p>
                <p><strong>Recebido em:</strong> {formatDateTime(selectedOrder.receivedAt)}</p>
              </AppSurface>

              <AppSurface className="space-y-2 p-4">
                <h4 className="font-semibold">Itens do pedido</h4>
                {selectedOrder.items.map((item) => (
                  <div key={`${selectedOrder.id}-drawer-${item.menuItemId}-${item.nameSnapshot}`} className="rounded-lg border border-[hsl(var(--border))] px-3 py-2">
                    <p className="font-medium">{item.quantity}x {item.nameSnapshot}</p>
                    <p className="text-sm text-[hsl(var(--foreground-muted))]">Unitário {formatCurrency(item.priceSnapshot)} • Total {formatCurrency(item.total)}</p>
                    {item.notes ? <p className="text-sm text-[hsl(var(--foreground-muted))]">Obs. item: {item.notes}</p> : null}
                  </div>
                ))}
              </AppSurface>

              <AppSurface className="space-y-2 p-4">
                <h4 className="font-semibold">Resumo financeiro</h4>
                <p>Subtotal: <strong>{formatCurrency(selectedOrder.subtotal)}</strong></p>
                <p>Taxa de serviço: <strong>{formatCurrency(selectedOrder.serviceFee)}</strong></p>
                <p>Total: <strong>{formatCurrency(selectedOrder.total)}</strong></p>
              </AppSurface>

              {selectedOrder.notes ? (
                <AppSurface className="p-4">
                  <h4 className="mb-1 font-semibold">Observações</h4>
                  <p className="text-sm text-[hsl(var(--foreground-muted))]">{selectedOrder.notes}</p>
                </AppSurface>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}

      {cancelDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-[hsl(var(--danger)/0.45)] bg-[hsl(var(--background-elevated))] p-5 shadow-2xl">
            <div className="mb-4 flex items-center gap-2 text-[hsl(var(--danger))]">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="text-lg font-semibold">Cancelar pedido #{cancelDialog.order.id.slice(-6).toUpperCase()}</h3>
            </div>
            <p className="mb-3 text-sm text-[hsl(var(--foreground-muted))]">
              Esta ação é crítica para o fluxo do salão e cozinha. Confirme apenas se o cancelamento foi validado com a operação.
            </p>
            <AppTextarea
              placeholder="Motivo obrigatório do cancelamento"
              value={cancelDialog.reason}
              onChange={(event) => setCancelDialog((current) => (current ? { ...current, reason: event.target.value } : null))}
            />
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <AppActionButton variant="secondary" onClick={() => setCancelDialog(null)}>Voltar</AppActionButton>
              <AppActionButton variant="destructive" onClick={() => void confirmCancellation()} disabled={updatingOrderId === cancelDialog.order.id}>
                Confirmar cancelamento
              </AppActionButton>
            </div>
          </div>
        </div>
      ) : null}

      {!isLoading && orders.length > 0 ? (
        <p className="flex items-center gap-2 text-xs text-[hsl(var(--foreground-muted))]">
          <ClipboardList className="h-4 w-4" />
          Fluxo pronto para integração de atualização em tempo real e registro de eventos na próxima etapa.
        </p>
      ) : null}
    </section>
  );
}
