"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, Loader2, Volume2, VolumeX, XCircle } from "lucide-react";

import { AppActionButton, AppEmptyState, AppFilterBar, AppSearchInput, AppSectionCard, AppSkeleton, AppStatusBadge, AppSurface, AppTextarea } from "@/components/ui/app-design-system";
import { orderStatusLabels, paymentMethodLabels } from "@/lib/constants/status-labels";
import { useAdminApi } from "@/lib/hooks/use-admin-api";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import { playNewOrderChime, useLiveOrders } from "@/lib/hooks/use-live-orders";
import type { Order, OrderStatus } from "@/lib/types/domain";
import { formatCurrency, formatTime } from "@/lib/utils/formatters";
import { appToast } from "@/lib/utils/toast";

type View = "open" | "ready" | "delivered" | "cancelled" | "today";

const VIEWS: Array<{ value: View; label: string; match: (order: Order, todayKey: string) => boolean }> = [
  { value: "open", label: "Cozinha", match: (order) => ["received", "confirmed", "in_preparation"].includes(order.status) },
  { value: "ready", label: "Para levar", match: (order) => order.status === "ready" },
  { value: "delivered", label: "Entregues hoje", match: (order, today) => order.status === "delivered" && order.dateKey === today },
  { value: "cancelled", label: "Cancelados hoje", match: (order, today) => order.status === "cancelled" && order.dateKey === today },
  { value: "today", label: "Todos de hoje", match: (order, today) => order.dateKey === today }
];

// One tap per person: the kitchen marks "Pronto"; the waiter may mark "Entregue"
// (optional: closing the table marks everything delivered automatically).
const NEXT_STEP: Partial<Record<OrderStatus, OrderStatus>> = { received: "ready", confirmed: "ready", in_preparation: "ready", ready: "delivered" };
const NEXT_LABEL: Partial<Record<OrderStatus, string>> = { ready: "Pronto", delivered: "Levei à mesa" };
const TONE: Record<OrderStatus, "info" | "warning" | "success" | "neutral" | "danger"> = { received: "info", confirmed: "info", in_preparation: "warning", ready: "success", delivered: "neutral", cancelled: "danger" };
const SOUND_KEY = "qrapido-sound-enabled";

function minutesAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return minutes < 1 ? "agora" : `há ${minutes} min`;
}

export default function PedidosPage(): JSX.Element {
  const { user } = useAdminAuth();
  const api = useAdminApi();
  const [soundOn, setSoundOn] = useState(true);
  const { orders, loading, error, dateKey } = useLiveOrders(user?.restaurantId, (order) => {
    if (soundOn) playNewOrderChime();
    appToast.info(`Novo pedido ${order.orderCode}`, `Mesa ${order.tableNumber} · ${order.items.length} item(ns)`);
  });
  const [view, setView] = useState<View>("open");
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [details, setDetails] = useState<Order | null>(null);
  const [cancel, setCancel] = useState<{ order: Order; reason: string } | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    try { setSoundOn(window.localStorage.getItem(SOUND_KEY) !== "off"); } catch { /* storage unavailable */ }
    const id = window.setInterval(() => setTick((tick) => tick + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    try { window.localStorage.setItem(SOUND_KEY, next ? "on" : "off"); } catch { /* ignore */ }
    if (next) playNewOrderChime();
  };

  const counts = useMemo(() => Object.fromEntries(VIEWS.map((item) => [item.value, orders.filter((order) => item.match(order, dateKey)).length])) as Record<View, number>, [orders, dateKey]);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matcher = VIEWS.find((item) => item.value === view)!.match;
    const list = orders.filter((order) => matcher(order, dateKey)).filter((order) => !term || `${order.orderCode} ${order.tableNumber} ${order.customerName ?? ""}`.toLowerCase().includes(term));
    // Kitchen reads oldest first; history newest first.
    return view === "open" || view === "ready" ? [...list].reverse() : list;
  }, [orders, view, search, dateKey]);

  const move = async (order: Order, nextStatus: OrderStatus, reason?: string) => {
    setUpdatingId(order.id);
    try {
      await api("/api/admin/order/transition", { orderId: order.id, nextStatus, ...(reason ? { reason } : {}) });
      appToast.success(`${order.orderCode}: ${orderStatusLabels[nextStatus]}`);
      return true;
    } catch (failure) {
      appToast.error("Não foi possível atualizar", failure instanceof Error ? failure.message : "Tente novamente.");
      return false;
    } finally {
      setUpdatingId(null);
    }
  };

  const confirmCancel = async () => {
    if (!cancel) return;
    if (cancel.reason.trim().length < 4) return appToast.error("Informe o motivo", "Escreva pelo menos 4 letras (ex.: item em falta).");
    if (await move(cancel.order, "cancelled", cancel.reason.trim())) setCancel(null);
  };

  return (
    <section className="space-y-4">
      {error ? <AppSurface className="flex items-start gap-3 border border-[hsl(var(--danger)/0.5)] p-4 text-sm"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--danger))]" /><p>{error}</p></AppSurface> : null}

      <AppFilterBar className="flex-wrap gap-2">
        <div className="flex flex-1 flex-wrap gap-2">
          {VIEWS.map((item) => (
            <button key={item.value} type="button" onClick={() => setView(item.value)} className={`h-9 rounded-full border px-4 text-xs font-semibold uppercase tracking-[0.1em] transition ${view === item.value ? "border-[hsl(var(--focus-ring)/0.45)] bg-[hsl(var(--primary)/0.2)]" : "border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))] text-[hsl(var(--foreground-muted))]"}`}>
              {item.label} <span className="ml-1 opacity-70">{counts[item.value]}</span>
            </button>
          ))}
        </div>
        <AppSearchInput className="md:max-w-xs" placeholder="Buscar código, mesa ou cliente" value={search} onChange={(event) => setSearch(event.target.value)} />
        <AppActionButton variant="secondary" className="gap-2" onClick={toggleSound} aria-pressed={soundOn}>{soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}{soundOn ? "Som ligado" : "Som desligado"}</AppActionButton>
      </AppFilterBar>

      <AppSectionCard title={view === "open" ? "Para a cozinha preparar" : view === "ready" ? "Prontos para levar à mesa" : "Pedidos"} description={view === "open" ? "Toque em \"Pronto\" quando o prato sair. Bebidas e itens de pronta entrega não aparecem aqui: vão direto para \"Para levar\"." : view === "ready" ? "\"Levei à mesa\" é opcional: ao encerrar a mesa, tudo vira entregue sozinho." : "Atualiza sozinho. Novos pedidos tocam um aviso sonoro (mantenha esta aba aberta)."}>
        {loading ? (
          <div className="space-y-3">{[0, 1, 2].map((index) => <AppSkeleton key={index} className="h-36 w-full" />)}</div>
        ) : visible.length === 0 ? (
          <AppEmptyState title={view === "open" ? "Nada para preparar agora" : view === "ready" ? "Nada esperando para ser levado" : "Nada por aqui"} description={view === "open" ? "Quando um cliente pedir um prato pelo QR Code, ele aparece aqui na hora." : "Escolha outro filtro."} />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {visible.map((order) => {
              const next = NEXT_STEP[order.status];
              const busy = updatingId === order.id;
              return (
                <AppSurface key={order.id} className="space-y-3 border border-[hsl(var(--border-strong))] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="flex flex-wrap items-center gap-2 font-mono text-sm font-semibold">{order.orderCode}<span className={`rounded-full px-2 py-0.5 font-sans text-[11px] font-semibold ${order.station === "ready" ? "bg-[hsl(var(--info)/0.15)] text-[hsl(var(--info))]" : "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]"}`}>{order.station === "ready" ? "Pronta entrega" : "Cozinha"}</span></p>
                      <h3 className="text-lg font-semibold">Mesa {order.tableNumber}{order.customerName ? ` · ${order.customerName}` : ""}</h3>
                      <p className="text-xs text-[hsl(var(--foreground-muted))]">{formatTime(order.receivedAt)} · {minutesAgo(order.receivedAt)}</p>
                    </div>
                    <AppStatusBadge tone={TONE[order.status]}>{orderStatusLabels[order.status]}</AppStatusBadge>
                  </div>
                  <ul className="space-y-1">
                    {order.items.map((item, index) => (
                      <li key={`${item.menuItemId}-${index}`} className="text-sm"><span className="font-semibold">{item.quantity}x</span> {item.nameSnapshot}{item.notes ? <span className="block pl-6 text-xs text-[hsl(var(--warning))]">Obs.: {item.notes}</span> : null}</li>
                    ))}
                  </ul>
                  {order.notes ? <p className="rounded-lg border border-[hsl(var(--warning)/0.45)] bg-[hsl(var(--warning)/0.1)] px-3 py-2 text-sm">Observação: {order.notes}</p> : null}
                  {order.status === "cancelled" && order.cancellationReason ? <p className="text-sm text-[hsl(var(--danger))]">Cancelado: {order.cancellationReason}</p> : null}
                  <p className="text-sm text-[hsl(var(--foreground-muted))]">{formatCurrency(order.total)} · {paymentMethodLabels[order.paymentMethod]}{order.changeFor ? ` · troco para ${formatCurrency(order.changeFor)}` : ""}</p>
                  <div className="flex flex-wrap gap-2">
                    {next ? <AppActionButton className={`gap-2 ${next === "ready" ? "h-12 min-w-40 text-base" : ""}`} variant={next === "ready" ? "primary" : "secondary"} disabled={busy} onClick={() => void move(order, next)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{NEXT_LABEL[next]}</AppActionButton> : null}
                    {next ? <AppActionButton variant="ghost" className="gap-2 text-[hsl(var(--danger))]" disabled={busy} onClick={() => setCancel({ order, reason: "" })}><XCircle className="h-4 w-4" />Cancelar</AppActionButton> : null}
                    <AppActionButton variant="ghost" className="gap-1" onClick={() => setDetails(order)}>Detalhes<ChevronRight className="h-4 w-4" /></AppActionButton>
                  </div>
                </AppSurface>
              );
            })}
          </div>
        )}
      </AppSectionCard>

      {details ? (
        <div className="fixed inset-0 z-40 bg-black/40 p-4" onClick={() => setDetails(null)} role="presentation">
          <aside className="ml-auto h-full w-full max-w-xl space-y-3 overflow-y-auto rounded-2xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--background-elevated))] p-5" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between"><div><p className="font-mono text-sm">{details.orderCode}</p><h3 className="text-xl font-semibold">Mesa {details.tableNumber}</h3></div><AppActionButton variant="ghost" onClick={() => setDetails(null)}>Fechar</AppActionButton></div>
            <AppSurface className="space-y-1 p-4 text-sm">
              <p>Cliente: <strong>{details.customerName || "não informado"}</strong></p>
              <p>Status: <strong>{orderStatusLabels[details.status]}</strong></p>
              <p>Recebido: <strong>{formatTime(details.receivedAt)}</strong></p>
              <p>Pagamento: <strong>{paymentMethodLabels[details.paymentMethod]}</strong>{details.paymentStatus ? ` (${details.paymentStatus})` : ""}</p>
            </AppSurface>
            <AppSurface className="space-y-2 p-4 text-sm">
              {details.items.map((item, index) => <p key={index} className="flex justify-between gap-2"><span>{item.quantity}x {item.nameSnapshot}{item.notes ? ` (${item.notes})` : ""}</span><span>{formatCurrency(item.total)}</span></p>)}
              <p className="flex justify-between border-t border-[hsl(var(--border))] pt-2"><span>Subtotal</span><span>{formatCurrency(details.subtotal)}</span></p>
              {details.serviceFee ? <p className="flex justify-between"><span>Taxa de serviço</span><span>{formatCurrency(details.serviceFee)}</span></p> : null}
              <p className="flex justify-between font-semibold"><span>Total</span><span>{formatCurrency(details.total)}</span></p>
            </AppSurface>
          </aside>
        </div>
      ) : null}

      {cancel ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md space-y-3 rounded-2xl border border-[hsl(var(--danger)/0.45)] bg-[hsl(var(--background-elevated))] p-5">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-[hsl(var(--danger))]"><AlertTriangle className="h-5 w-5" />Cancelar {cancel.order.orderCode}?</h3>
            <p className="text-sm text-[hsl(var(--foreground-muted))]">O cliente verá o pedido como cancelado, com o motivo abaixo.</p>
            <AppTextarea autoFocus value={cancel.reason} maxLength={300} onChange={(event) => setCancel({ ...cancel, reason: event.target.value })} placeholder="Motivo (ex.: item em falta)" />
            <div className="flex justify-end gap-2"><AppActionButton variant="secondary" onClick={() => setCancel(null)}>Voltar</AppActionButton><AppActionButton variant="destructive" disabled={updatingId === cancel.order.id} onClick={() => void confirmCancel()}>Cancelar pedido</AppActionButton></div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
