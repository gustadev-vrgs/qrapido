"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChefHat, Loader2, Volume2, VolumeX } from "lucide-react";

import { AppActionButton, AppEmptyState, AppSkeleton, AppSurface, AppTextarea } from "@/components/ui/app-design-system";
import { AppModal } from "@/components/ui/app-modal";
import { useAdminApi } from "@/lib/hooks/use-admin-api";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import { playChime, useLiveOrders } from "@/lib/hooks/use-live-orders";
import { useSoundSetting } from "@/lib/hooks/use-sound-setting";
import { useWakeLock } from "@/lib/hooks/use-wake-lock";
import type { Order } from "@/lib/types/domain";
import { cn } from "@/lib/utils/cn";
import { formatTime } from "@/lib/utils/formatters";
import { minutesSince } from "@/lib/utils/table-view";
import { appToast } from "@/lib/utils/toast";

const IN_KITCHEN = new Set(["received", "confirmed", "in_preparation"]);

/** Waiting time colour: calm, attention (10 min), late (20 min). */
function waitTone(minutes: number): string {
  if (minutes >= 20) return "bg-[hsl(var(--danger))] text-white";
  if (minutes >= 10) return "bg-[hsl(var(--gema))] text-[hsl(217_28%_15%)]";
  return "bg-[hsl(var(--surface-muted))] text-[hsl(var(--foreground))]";
}

export default function CozinhaPage(): JSX.Element {
  const { user } = useAdminAuth();
  const api = useAdminApi();
  const [soundOn, toggleSound] = useSoundSetting();
  const { orders, loading, error } = useLiveOrders(user?.restaurantId, (order) => {
    if (order.status === "ready" || order.station === "ready") return;
    if (soundOn) playChime("order");
    appToast.info(`Novo pedido · Mesa ${order.tableNumber}`, order.items.map((item) => `${item.quantity}x ${item.nameSnapshot}`).join(", "));
  });
  const [now, setNow] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancel, setCancel] = useState<{ order: Order; reason: string } | null>(null);
  useWakeLock();

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(id);
  }, []);

  // Oldest first: the kitchen works in arrival order.
  const queue = useMemo(() => orders.filter((order) => IN_KITCHEN.has(order.status) && order.station !== "ready").sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)), [orders]);
  const toMake = useMemo(() => {
    const totals = new Map<string, number>();
    queue.forEach((order) => order.items.filter((item) => item.station !== "ready").forEach((item) => totals.set(item.nameSnapshot, (totals.get(item.nameSnapshot) ?? 0) + item.quantity)));
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [queue]);

  const markReady = async (order: Order) => {
    setBusyId(order.id);
    try {
      await api("/api/admin/order/transition", { orderId: order.id, nextStatus: "ready" });
      appToast.success(`Mesa ${order.tableNumber}: pronto`, "O garçom foi avisado.");
    } catch (failure) {
      appToast.error("Não foi possível marcar como pronto", failure instanceof Error ? failure.message : "Tente novamente.");
    } finally {
      setBusyId(null);
    }
  };

  const confirmCancel = async () => {
    if (!cancel) return;
    if (cancel.reason.trim().length < 4) return appToast.error("Informe o motivo", "Ex.: acabou o frango.");
    setBusyId(cancel.order.id);
    try {
      await api("/api/admin/order/transition", { orderId: cancel.order.id, nextStatus: "cancelled", reason: cancel.reason.trim() });
      appToast.success(`Pedido ${cancel.order.orderCode} cancelado`);
      setCancel(null);
    } catch (failure) {
      appToast.error("Não foi possível cancelar", failure instanceof Error ? failure.message : "Tente novamente.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-4">
      {error ? <AppSurface className="flex items-start gap-3 border-[hsl(var(--danger)/0.5)] p-4 text-sm"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--danger))]" /><p>{error}</p></AppSurface> : null}

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-lg font-semibold"><span className="num text-2xl">{queue.length}</span> {queue.length === 1 ? "pedido na fila" : "pedidos na fila"}</p>
        <AppActionButton variant="secondary" className="ml-auto gap-2" onClick={toggleSound} aria-pressed={soundOn}>{soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}{soundOn ? "Som ligado" : "Som desligado"}</AppActionButton>
      </div>

      {toMake.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <span className="shrink-0 self-center text-sm text-[hsl(var(--foreground-muted))]">Para fazer:</span>
          {toMake.map(([name, quantity]) => <span key={name} className="shrink-0 rounded-full bg-[hsl(var(--gema)/0.18)] px-3 py-1 text-sm"><strong className="num">{quantity}x</strong> {name}</span>)}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((index) => <AppSkeleton key={index} className="h-64" />)}</div>
      ) : queue.length === 0 ? (
        <AppEmptyState icon={ChefHat} title="Cozinha em dia" description="Quando um cliente pedir um prato pelo QR Code, ele aparece aqui na hora, com aviso sonoro. Bebidas não passam pela cozinha." />
      ) : (
        <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {queue.map((order) => {
            const minutes = now ? minutesSince(order.receivedAt, now) : 0;
            const busy = busyId === order.id;
            return (
              <article key={order.id} className="comanda flex flex-col gap-3 p-4 pl-5" data-tone="kitchen">
                <header className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-3xl font-bold leading-none">Mesa {order.tableNumber}</h2>
                    <p className="mt-1 text-sm text-[hsl(var(--foreground-muted))]"><span className="num">{order.orderCode}</span> · {formatTime(order.receivedAt)}{order.customerName ? ` · ${order.customerName}` : ""}</p>
                  </div>
                  <span className={cn("num shrink-0 rounded-full px-3 py-1 text-base font-bold", waitTone(minutes))}>{minutes} min</span>
                </header>
                <ul className="space-y-2">
                  {order.items.map((item, index) => (
                    <li key={`${item.menuItemId}-${index}`} className="text-lg leading-snug">
                      <span className="num font-bold">{item.quantity}x</span> {item.nameSnapshot}
                      {item.notes ? <span className="mt-1 block rounded-lg bg-[hsl(var(--gema)/0.18)] px-2 py-1 text-base font-medium">↳ {item.notes}</span> : null}
                    </li>
                  ))}
                </ul>
                {order.notes ? <p className="rounded-lg border border-[hsl(var(--danger)/0.4)] bg-[hsl(var(--danger)/0.06)] px-3 py-2 text-base"><strong>Atenção:</strong> {order.notes}</p> : null}
                <AppActionButton variant="success" className="mt-1 h-14 w-full gap-2 text-lg" disabled={busy} onClick={() => void markReady(order)}>{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-6 w-6" />}Pronto</AppActionButton>
                <button type="button" className="self-center text-sm text-[hsl(var(--foreground-muted))] underline-offset-2 hover:text-[hsl(var(--danger))] hover:underline" disabled={busy} onClick={() => setCancel({ order, reason: "" })}>Não dá para fazer? Cancelar</button>
              </article>
            );
          })}
        </div>
      )}

      {cancel ? (
        <AppModal title={`Cancelar pedido da Mesa ${cancel.order.tableNumber}?`} onClose={() => setCancel(null)}>
          <p className="text-sm text-[hsl(var(--foreground-muted))]">O cliente vê o pedido como cancelado, com o motivo abaixo, e não paga por ele.</p>
          <AppTextarea autoFocus value={cancel.reason} maxLength={300} onChange={(event) => setCancel({ ...cancel, reason: event.target.value })} placeholder="Motivo (ex.: acabou o frango)" />
          <div className="flex justify-end gap-2"><AppActionButton variant="secondary" onClick={() => setCancel(null)}>Voltar</AppActionButton><AppActionButton variant="destructive" disabled={busyId === cancel.order.id} onClick={() => void confirmCancel()}>Cancelar pedido</AppActionButton></div>
        </AppModal>
      ) : null}
    </section>
  );
}
