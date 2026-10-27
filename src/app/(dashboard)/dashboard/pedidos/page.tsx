"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";
import { AlertTriangle, Ban, CheckCheck, ChefHat, ChevronRight, ClipboardList, CupSoda, HandPlatter, XCircle } from "lucide-react";

import { AppActionButton, AppChips, AppEmptyState, AppSearchInput, AppSkeleton, AppSurface, AppTextarea } from "@/components/ui/app-design-system";
import { AppModal } from "@/components/ui/app-modal";
import { paymentMethodLabels } from "@/lib/constants/status-labels";
import { useAdminApi } from "@/lib/hooks/use-admin-api";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import { useLiveOrders } from "@/lib/hooks/use-live-orders";
import type { Order } from "@/lib/types/domain";
import { cn } from "@/lib/utils/cn";
import { describeOrderItem, formatOptions } from "@/lib/utils/menu-options";
import { formatCurrency, formatTime } from "@/lib/utils/formatters";
import { appToast } from "@/lib/utils/toast";

type View = "today" | "kitchen" | "ready" | "delivered" | "cancelled";

const KITCHEN = ["received", "confirmed", "in_preparation"];
const VIEWS: Array<{ value: View; label: string; icon: typeof ChefHat; match: (order: Order, today: string) => boolean }> = [
  { value: "today", label: "Todos de hoje", icon: ClipboardList, match: (order, today) => order.dateKey === today || KITCHEN.includes(order.status) || order.status === "ready" },
  { value: "kitchen", label: "Na cozinha", icon: ChefHat, match: (order) => KITCHEN.includes(order.status) },
  { value: "ready", label: "Para levar", icon: HandPlatter, match: (order) => order.status === "ready" },
  { value: "delivered", label: "Entregues", icon: CheckCheck, match: (order, today) => order.status === "delivered" && order.dateKey === today },
  { value: "cancelled", label: "Cancelados", icon: Ban, match: (order, today) => order.status === "cancelled" && order.dateKey === today }
];

const STATUS: Record<Order["status"], { label: string; className: string }> = {
  received: { label: "Na cozinha", className: "bg-[hsl(var(--gema)/0.2)] text-[hsl(var(--warning))]" },
  confirmed: { label: "Na cozinha", className: "bg-[hsl(var(--gema)/0.2)] text-[hsl(var(--warning))]" },
  in_preparation: { label: "Na cozinha", className: "bg-[hsl(var(--gema)/0.2)] text-[hsl(var(--warning))]" },
  ready: { label: "Para levar", className: "bg-[hsl(var(--success)/0.14)] text-[hsl(var(--success))]" },
  delivered: { label: "Entregue", className: "bg-[hsl(var(--surface-muted))] text-[hsl(var(--foreground-muted))]" },
  cancelled: { label: "Cancelado", className: "bg-[hsl(var(--danger)/0.1)] text-[hsl(var(--danger))]" }
};

/** Every order of the day in one list: search, details and cancellation. The day-to-day work happens in Cozinha and Salão. */
export default function PedidosPage(): JSX.Element {
  const { user } = useAdminAuth();
  const api = useAdminApi();
  const { orders, loading, error, dateKey } = useLiveOrders(user?.restaurantId);
  const [view, setView] = useState<View>("today");
  const [search, setSearch] = useState("");
  const [details, setDetails] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const counts = useMemo(() => Object.fromEntries(VIEWS.map((item) => [item.value, orders.filter((order) => item.match(order, dateKey)).length])) as Record<View, number>, [orders, dateKey]);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matcher = VIEWS.find((item) => item.value === view)!.match;
    return orders.filter((order) => matcher(order, dateKey)).filter((order) => !term || `${order.orderCode} mesa ${order.tableNumber} ${order.customerName ?? ""} ${order.items.map((item) => item.nameSnapshot).join(" ")}`.toLowerCase().includes(term));
  }, [orders, view, search, dateKey]);

  const live = details ? orders.find((order) => order.id === details.id) ?? details : null;

  const cancelOrder = async () => {
    if (!live || cancelReason === null) return;
    if (cancelReason.trim().length < 4) return appToast.error("Informe o motivo", "Escreva pelo menos 4 letras (ex.: item em falta).");
    setBusy(true);
    try {
      await api("/api/admin/order/transition", { orderId: live.id, nextStatus: "cancelled", reason: cancelReason.trim() });
      appToast.success(`Pedido ${live.orderCode} cancelado`);
      setCancelReason(null);
    } catch (failure) {
      appToast.error("Não foi possível cancelar", failure instanceof Error ? failure.message : "Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      {error ? <AppSurface className="flex items-start gap-3 border-[hsl(var(--danger)/0.5)] p-4 text-sm"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--danger))]" /><p>{error}</p></AppSurface> : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <AppChips className="min-w-0 flex-1" value={view} onChange={setView} options={VIEWS.map((item) => ({ value: item.value, label: item.label, icon: item.icon, count: counts[item.value] }))} />
        <AppSearchInput className="w-full lg:max-w-xs" placeholder="Buscar mesa, código, cliente ou prato" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>

      <AppSurface className="overflow-hidden p-0">
        {loading ? <div className="space-y-2 p-4">{[0, 1, 2, 3].map((index) => <AppSkeleton key={index} className="h-14" />)}</div> : visible.length === 0 ? (
          <div className="p-4"><AppEmptyState icon={ClipboardList} title="Nenhum pedido aqui" description={search ? "Nada encontrado com essa busca." : "Os pedidos do dia aparecem aqui conforme chegam."} /></div>
        ) : (
          <ul className="divide-y divide-[hsl(var(--border))]">
            {visible.map((order) => (
              <li key={order.id}>
                <button type="button" onClick={() => setDetails(order)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[hsl(var(--surface-muted))]">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--surface-muted))]">{order.station === "ready" ? <CupSoda className="h-4 w-4" /> : <ChefHat className="h-4 w-4" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2"><strong>Mesa {order.tableNumber}</strong><span className="num text-xs text-[hsl(var(--foreground-muted))]">{order.orderCode} · {formatTime(order.receivedAt)}</span></span>
                    <span className="block truncate text-sm text-[hsl(var(--foreground-muted))]">{order.items.map(describeOrderItem).join(", ")}</span>
                  </span>
                  <span className="hidden text-right sm:block"><span className="num block text-sm font-semibold">{formatCurrency(order.total)}</span></span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", STATUS[order.status].className)}>{STATUS[order.status].label}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[hsl(var(--foreground-muted))]" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </AppSurface>

      {live ? (
        <AppModal title={`Mesa ${live.tableNumber} · ${live.orderCode}`} onClose={() => { setDetails(null); setCancelReason(null); }}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATUS[live.status].className)}>{STATUS[live.status].label}</span>
            <span className="text-[hsl(var(--foreground-muted))]">Recebido {formatTime(live.receivedAt)}{live.customerName ? ` · ${live.customerName}` : ""}</span>
          </div>
          <div className="space-y-1.5 rounded-[var(--radius-md)] border border-[hsl(var(--border))] p-3 text-sm">
            {live.items.map((item, index) => <p key={index} className="flex justify-between gap-2"><span><span className="num font-semibold">{item.quantity}x</span> {item.nameSnapshot}{item.notes ? ` (${item.notes})` : ""}{item.options?.length ? <span className="block text-xs text-[hsl(var(--foreground-muted))]">{formatOptions(item.options)}</span> : null}</span><span className="num">{formatCurrency(item.total)}</span></p>)}
            <p className="flex justify-between border-t border-[hsl(var(--border))] pt-2"><span>Subtotal</span><span className="num">{formatCurrency(live.subtotal)}</span></p>
            {live.serviceFee ? <p className="flex justify-between"><span>Taxa de serviço</span><span className="num">{formatCurrency(live.serviceFee)}</span></p> : null}
            <p className="flex justify-between font-semibold"><span>Total</span><span className="num">{formatCurrency(live.total)}</span></p>
          </div>
          <p className="text-sm text-[hsl(var(--foreground-muted))]">Pagamento: {live.paidWith ? `pago (${paymentMethodLabels[live.paidWith]})` : `${paymentMethodLabels[live.paymentMethod]}${live.paymentStatus ? ` · ${live.paymentStatus}` : ""}`}{live.changeFor ? ` · troco para ${formatCurrency(live.changeFor)}` : ""}</p>
          {live.notes ? <p className="rounded-lg bg-[hsl(var(--gema)/0.14)] px-3 py-2 text-sm">Observação: {live.notes}</p> : null}
          {live.status === "cancelled" && live.cancellationReason ? <p className="text-sm text-[hsl(var(--danger))]">Cancelado: {live.cancellationReason}</p> : null}
          {cancelReason !== null ? (
            <div className="space-y-2">
              <AppTextarea autoFocus value={cancelReason} maxLength={300} onChange={(event) => setCancelReason(event.target.value)} placeholder="Motivo do cancelamento (o cliente vê)" />
              <div className="flex justify-end gap-2"><AppActionButton variant="secondary" onClick={() => setCancelReason(null)}>Voltar</AppActionButton><AppActionButton variant="destructive" disabled={busy} onClick={() => void cancelOrder()}>Cancelar pedido</AppActionButton></div>
            </div>
          ) : (
            <div className="flex flex-wrap justify-between gap-2">
              <Link href={`/dashboard/mesas/${live.tableId}` as Route}><AppActionButton variant="secondary">Ver mesa</AppActionButton></Link>
              {live.status !== "cancelled" && live.status !== "delivered" ? <AppActionButton variant="ghost" className="gap-2 text-[hsl(var(--danger))]" onClick={() => setCancelReason("")}><XCircle className="h-4 w-4" />Cancelar pedido</AppActionButton> : null}
            </div>
          )}
        </AppModal>
      ) : null}
    </section>
  );
}
