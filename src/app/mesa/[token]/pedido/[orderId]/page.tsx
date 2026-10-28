"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChefHat, Clock3, UtensilsCrossed } from "lucide-react";

import { AppActionButton, AppSkeleton, AppStatusBadge, AppSurface } from "@/components/ui/app-design-system";
import { paymentMethodLabels } from "@/lib/constants/status-labels";
import { customerStatusLabel } from "@/lib/utils/customer-order-status";
import type { PublicOrder } from "@/lib/types/domain";
import { formatCurrency, formatTime } from "@/lib/utils/formatters";
import { formatOptions } from "@/lib/utils/menu-options";

const KITCHEN_STEPS = [
  { key: "received", label: "Na cozinha", icon: ChefHat },
  { key: "ready", label: "Pronto", icon: UtensilsCrossed },
  { key: "delivered", label: "Entregue", icon: CheckCircle2 }
] as const;
const READY_STEPS = [
  { key: "received", label: "Recebido", icon: Clock3 },
  { key: "ready", label: "A caminho", icon: UtensilsCrossed },
  { key: "delivered", label: "Entregue", icon: CheckCircle2 }
] as const;

function stepIndex(status: PublicOrder["status"]): number {
  if (status === "delivered") return 2;
  if (status === "ready") return 1;
  return 0;
}

export default function PublicOrderPage(): JSX.Element {
  const params = useParams<{ token: string; orderId: string }>();
  const token = useMemo(() => decodeURIComponent(params.token), [params.token]);
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    // The order API accepts the device that ordered even after the table is closed,
    // so tracking no longer depends on the table still being open.
    const load = async () => {
      try {
        const response = await fetch(`/api/public/order/${encodeURIComponent(params.orderId)}`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!alive) return;
        if (!response.ok) { setError(payload.error ?? "Pedido indisponível."); return; }
        setOrder(payload as PublicOrder);
        setError("");
        if (!["delivered", "cancelled"].includes((payload as PublicOrder).status)) timer = window.setTimeout(() => void load(), 5000);
      } catch {
        if (alive) timer = window.setTimeout(() => void load(), 8000);
      }
    };
    void load();
    return () => { alive = false; window.clearTimeout(timer); };
  }, [params.orderId]);

  const back = <Link href={`/mesa/${encodeURIComponent(token)}`} className="block"><AppActionButton variant="secondary" className="w-full gap-2"><ArrowLeft className="h-4 w-4" />Voltar ao cardápio</AppActionButton></Link>;

  if (error && !order) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
        <AppSurface className="w-full space-y-3 p-6 text-center"><AlertTriangle className="mx-auto h-8 w-8 text-[hsl(var(--warning))]" /><p>{error}</p>{back}</AppSurface>
      </main>
    );
  }
  if (!order) return <main className="mx-auto max-w-md p-4"><AppSkeleton className="h-64" /></main>;

  const current = stepIndex(order.status);
  const STEPS = order.station === "ready" ? READY_STEPS : KITCHEN_STEPS;
  const cancelled = order.status === "cancelled";
  return (
    <main className="min-h-screen bg-[hsl(var(--background))] p-4">
      <section className="mx-auto max-w-md space-y-4">
        <AppSurface className="space-y-2 p-4">
          <p className="text-xs text-[hsl(var(--foreground-muted))]">Mesa {order.tableNumber} · {formatTime(order.receivedAt)}</p>
          <h1 className="num text-2xl">{order.orderCode}</h1>
          <AppStatusBadge tone={cancelled ? "danger" : order.status === "delivered" ? "success" : "info"}>{customerStatusLabel(order.status, order.station)}</AppStatusBadge>
        </AppSurface>

        <AppSurface className="p-4">
          {cancelled ? (
            <p className="text-sm text-[hsl(var(--danger))]">Este pedido foi cancelado pelo restaurante.{order.cancellationReason ? ` Motivo: ${order.cancellationReason}.` : ""} Fale com um atendente se tiver dúvidas.</p>
          ) : (
            <ol className="grid grid-cols-3 gap-2 text-center text-xs">
              {STEPS.map((step, index) => {
                const Icon = step.icon;
                const done = index <= current;
                return (
                  <li key={step.key} className="flex flex-col items-center gap-1">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-full ${done ? "bg-[hsl(var(--primary))] text-white" : "bg-[hsl(var(--surface-muted))] text-[hsl(var(--foreground-muted))]"} ${index === current && order.status !== "delivered" ? "animate-pulse" : ""}`}><Icon className="h-5 w-5" /></span>
                    <span className={done ? "font-semibold" : "text-[hsl(var(--foreground-muted))]"}>{step.label}</span>
                  </li>
                );
              })}
            </ol>
          )}
          {!cancelled && order.status !== "delivered" ? <p className="mt-3 text-center text-xs text-[hsl(var(--foreground-muted))]">Esta página se atualiza sozinha.</p> : null}
        </AppSurface>

        <AppSurface className="space-y-2 p-4 text-sm">
          {order.items.map((item, index) => <div key={`${item.menuItemId}-${index}`} className="flex justify-between gap-2"><span>{item.quantity}x {item.nameSnapshot}{item.options?.length ? <span className="block text-xs text-[hsl(var(--foreground-muted))]">{formatOptions(item.options)}</span> : null}{item.notes ? <span className="block text-xs text-[hsl(var(--foreground-muted))]">Obs.: {item.notes}</span> : null}</span><strong>{formatCurrency(item.total)}</strong></div>)}
          {order.serviceFee ? <div className="flex justify-between border-t border-[hsl(var(--border))] pt-2"><span>Taxa de serviço</span><span>{formatCurrency(order.serviceFee)}</span></div> : null}
          <div className="flex justify-between border-t border-[hsl(var(--border))] pt-2 text-base"><span>Total</span><strong>{formatCurrency(order.total)}</strong></div>
          <p className="text-[hsl(var(--foreground-muted))]">Pagamento: {paymentMethodLabels[order.paymentMethod] ?? order.paymentMethod}{order.paymentStatus ? ` · ${order.paymentStatus}` : ""}</p>
        </AppSurface>

        {back}
      </section>
    </main>
  );
}
