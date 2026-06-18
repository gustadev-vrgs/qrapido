"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { AppActionButton, AppSkeleton, AppStatusBadge, AppSurface } from "@/components/ui/app-design-system";
import { orderStatusLabels, paymentMethodLabels } from "@/lib/constants/status-labels";
import type { Order, PublicTableData } from "@/lib/types/domain";
import { formatCurrency, formatDateTime } from "@/lib/utils/formatters";

interface PublicOrderPageProps {
  params: { token: string; orderId: string };
}

type PublicTablePayload = PublicTableData & { accessToken: string };

const TRACKING_STEPS: Array<Extract<Order["status"], "received" | "in_preparation" | "ready" | "delivered">> = [
  "received",
  "in_preparation",
  "ready",
  "delivered"
];

export default function PublicOrderPage({ params }: PublicOrderPageProps): JSX.Element {
  const token = useMemo(() => decodeURIComponent(params.token), [params.token]);
  const [tableData, setTableData] = useState<PublicTablePayload | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    async function loadTable(): Promise<void> {
      const response = await fetch(`/api/public/table/${encodeURIComponent(token)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!alive) return;

      if (!response.ok) {
        setError(payload.error ?? "Mesa inválida.");
        return;
      }

      const publicTablePayload = payload as PublicTablePayload;
      setTableData(publicTablePayload);
      window.sessionStorage.setItem(`qrapido-access-${publicTablePayload.session.id}`, publicTablePayload.accessToken);
    }

    void loadTable();

    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    const currentTableData = tableData;
    if (!currentTableData) return;

    const currentSessionId = currentTableData.session.id;
    const currentSessionToken = currentTableData.session.sessionToken;
    let alive = true;

    async function loadOrder(): Promise<void> {
      const accessToken = window.sessionStorage.getItem(`qrapido-access-${currentSessionId}`) ?? "";
      const response = await fetch(
        `/api/public/order/${encodeURIComponent(params.orderId)}?sessionToken=${encodeURIComponent(currentSessionToken)}`,
        { headers: { "x-session-access-token": accessToken }, cache: "no-store" }
      );
      const payload = await response.json().catch(() => ({}));
      if (!alive) return;

      if (!response.ok) {
        setError(payload.error ?? "Pedido indisponível.");
        return;
      }

      setOrder(payload as Order);
    }

    void loadOrder();
    const intervalId = window.setInterval(() => void loadOrder(), 5000);

    return () => {
      alive = false;
      window.clearInterval(intervalId);
    };
  }, [params.orderId, tableData]);

  if (error) {
    return (
      <main className="min-h-screen p-4">
        <AppSurface className="mx-auto max-w-md p-5 text-center">
          {error}
          <div className="mt-3">
            <Link href={`/mesa/${token}`}>Voltar para mesa</Link>
          </div>
        </AppSurface>
      </main>
    );
  }

  if (!order || !tableData) {
    return (
      <main className="min-h-screen p-4">
        <AppSkeleton className="mx-auto h-64 max-w-md" />
      </main>
    );
  }

  const currentStepIndex = order.status === "cancelled" ? -1 : TRACKING_STEPS.indexOf(order.status as (typeof TRACKING_STEPS)[number]);

  return (
    <main className="min-h-screen bg-[hsl(var(--background))] p-4">
      <section className="mx-auto max-w-md space-y-4">
        <AppSurface className="space-y-2 p-4">
          <p className="text-xs uppercase text-[hsl(var(--foreground-muted))]">Mesa {order.tableNumber}</p>
          <h1 className="text-2xl">Pedido {(order as any).orderCode ?? `#${order.id.slice(-6).toUpperCase()}`}</h1>
          <AppStatusBadge tone={order.status === "cancelled" ? "danger" : "info"}>{orderStatusLabels[order.status]}</AppStatusBadge>
          <p className="text-sm text-[hsl(var(--foreground-muted))]">Criado em {formatDateTime(order.createdAt)}</p>
        </AppSurface>

        <AppSurface className="p-4">
          <div className="grid grid-cols-4 gap-1 text-center text-xs">
            {TRACKING_STEPS.map((step, index) => (
              <div key={step} className={`rounded-full px-2 py-2 ${index <= currentStepIndex ? "bg-[hsl(var(--primary))] text-white" : "bg-[hsl(var(--surface-muted))]"}`}>
                {orderStatusLabels[step]}
              </div>
            ))}
          </div>
          {order.status === "cancelled" ? (
            <p className="mt-3 text-sm text-[hsl(var(--danger))]">Motivo: {(order as any).cancelReason ?? order.notes ?? "não informado"}</p>
          ) : null}
        </AppSurface>

        <AppSurface className="space-y-2 p-4">
          <h2 className="font-semibold">Itens</h2>
          {order.items.map((item) => (
            <div key={`${item.menuItemId}-${item.notes ?? ""}`} className="flex justify-between text-sm">
              <span>{item.quantity}x {item.nameSnapshot}</span>
              <strong>{formatCurrency(item.total)}</strong>
            </div>
          ))}
          <div className="flex justify-between border-t border-[hsl(var(--border))] pt-2">
            <span>Total</span>
            <strong>{formatCurrency(order.total)}</strong>
          </div>
        </AppSurface>

        <AppSurface className="p-4 text-sm">
          <p>Pagamento: <strong>{paymentMethodLabels[order.paymentMethod]}</strong></p>
          <p>Status pagamento: <strong>{(order as any).paymentStatus ?? "pendente"}</strong></p>
        </AppSurface>

        <AppActionButton variant="secondary" className="w-full" onClick={() => { window.location.href = `/mesa/${encodeURIComponent(token)}`; }}>
          Voltar ao cardápio
        </AppActionButton>
      </section>
    </main>
  );
}
