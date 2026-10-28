"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BellRing, Check, ChefHat, CupSoda, HandPlatter, Loader2, ReceiptText, Volume2, VolumeX } from "lucide-react";

import { AppActionButton, AppEmptyState, AppSectionCard, AppSkeleton, AppSurface } from "@/components/ui/app-design-system";
import { useAdminApi } from "@/lib/hooks/use-admin-api";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import { playChime, useLiveOrders } from "@/lib/hooks/use-live-orders";
import { useSoundSetting } from "@/lib/hooks/use-sound-setting";
import { SoundUnlockNotice } from "@/components/shared/sound-unlock-notice";
import { ConnectionBanner } from "@/components/shared/connection-banner";
import { useWaiterCalls, waiterReasonLabel } from "@/lib/hooks/use-waiter-calls";
import { useWakeLock } from "@/lib/hooks/use-wake-lock";
import type { Order } from "@/lib/types/domain";
import { cn } from "@/lib/utils/cn";
import { describeOrderItem, formatOptions } from "@/lib/utils/menu-options";
import { elapsedLabel } from "@/lib/utils/table-view";
import { appToast } from "@/lib/utils/toast";

const IN_KITCHEN = new Set(["received", "confirmed", "in_preparation"]);

interface TableGroup { tableId: string; tableNumber: number; orders: Order[]; since: string }

function groupByTable(orders: Order[], since: (order: Order) => string): TableGroup[] {
  const groups = new Map<string, TableGroup>();
  orders.forEach((order) => {
    const group = groups.get(order.tableId) ?? { tableId: order.tableId, tableNumber: order.tableNumber, orders: [], since: since(order) };
    group.orders.push(order);
    if (since(order) < group.since) group.since = since(order);
    groups.set(order.tableId, group);
  });
  return [...groups.values()].sort((a, b) => a.since.localeCompare(b.since));
}

export default function SalaoPage(): JSX.Element {
  const { user } = useAdminAuth();
  const api = useAdminApi();
  const [soundOn, toggleSound] = useSoundSetting();
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  const { orders, loading, error, stale } = useLiveOrders(user?.restaurantId);
  const { calls, error: callsError, resolve } = useWaiterCalls(Boolean(user), (call) => {
    if (soundRef.current) playChime("call");
    appToast.info(`Mesa ${call.tableNumber} chamou`, waiterReasonLabel(call.reason));
  });
  const [now, setNow] = useState(0);
  const [busyTable, setBusyTable] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  useWakeLock();

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const ready = useMemo(() => orders.filter((order) => order.status === "ready"), [orders]);
  const inKitchen = useMemo(() => orders.filter((order) => IN_KITCHEN.has(order.status)), [orders]);
  const toDeliver = useMemo(() => groupByTable(ready, (order) => order.readyAt ?? order.receivedAt), [ready]);
  const waiting = useMemo(() => groupByTable(inKitchen, (order) => order.receivedAt), [inKitchen]);

  // Chime when something new is ready to take (drinks ordered now, or a dish the kitchen just finished).
  const seenReady = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (loading) return;
    const ids = new Set(ready.map((order) => order.id));
    if (seenReady.current) {
      const fresh = ready.filter((order) => !seenReady.current!.has(order.id));
      if (fresh.length) {
        if (soundRef.current) playChime("ready");
        const tables = [...new Set(fresh.map((order) => order.tableNumber))].join(", ");
        appToast.success(`Pronto para levar · Mesa ${tables}`);
      }
    }
    seenReady.current = ids;
  }, [ready, loading]);

  const deliverAll = async (group: TableGroup) => {
    setBusyTable(group.tableId);
    try {
      for (const order of group.orders) await api("/api/admin/order/transition", { orderId: order.id, nextStatus: "delivered" });
    } catch (failure) {
      appToast.error("Não foi possível marcar como entregue", failure instanceof Error ? failure.message : "Tente novamente.");
    } finally {
      setBusyTable(null);
    }
  };

  const resolveCall = async (callId: string) => {
    const call = calls.find((item) => item.id === callId);
    if (!call) return;
    setResolving(callId);
    try {
      await resolve(call);
    } catch (failure) {
      appToast.error("Não foi possível resolver o chamado", failure instanceof Error ? failure.message : "Tente novamente.");
    } finally {
      setResolving(null);
    }
  };

  return (
    <section className="space-y-4">
      <ConnectionBanner stale={stale} />
      <SoundUnlockNotice enabled={soundOn} />
      {error ? <AppSurface className="flex items-start gap-3 border-[hsl(var(--danger)/0.5)] p-4 text-sm"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--danger))]" /><p>{error}</p></AppSurface> : null}

      <div className="flex items-center gap-3">
        <p className="text-sm text-[hsl(var(--foreground-muted))]">Deixe aberta: avisa com som quando algo fica pronto ou um cliente chama.</p>
        <AppActionButton variant="secondary" className="ml-auto gap-2" onClick={toggleSound} aria-pressed={soundOn}>{soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}<span className="hidden sm:inline">{soundOn ? "Som ligado" : "Som desligado"}</span></AppActionButton>
      </div>

      {calls.length ? (
        <div className="space-y-2">
          {calls.map((call) => {
            const paying = call.reason === "fazer pagamento";
            return (
              <AppSurface key={call.id} className="flex flex-wrap items-center gap-3 border-[hsl(var(--danger)/0.5)] bg-[hsl(var(--danger)/0.06)] p-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--danger))] text-white"><BellRing className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-bold leading-tight">Mesa {call.tableNumber}</p>
                  <p className="text-sm">{waiterReasonLabel(call.reason)} · <span className="text-[hsl(var(--foreground-muted))]">{now ? elapsedLabel(call.createdAt, now) : ""}</span></p>
                </div>
                <div className="flex w-full gap-2 sm:w-auto">
                  {paying ? <Link href={`/dashboard/mesas/${call.tableId}` as Route} className="flex-1 sm:flex-none"><AppActionButton variant="secondary" className="w-full gap-2"><ReceiptText className="h-4 w-4" />Ver conta</AppActionButton></Link> : null}
                  <AppActionButton className="flex-1 gap-2 sm:flex-none" disabled={resolving === call.id} onClick={() => void resolveCall(call.id)}>{resolving === call.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Resolvido</AppActionButton>
                </div>
              </AppSurface>
            );
          })}
        </div>
      ) : null}
      {callsError ? <p className="text-sm text-[hsl(var(--danger))]">{callsError}</p> : null}

      <AppSectionCard icon={HandPlatter} tone="success" title="Levar à mesa" description="Bebidas chegam aqui na hora; pratos, quando a cozinha toca em Pronto.">
        {loading ? <AppSkeleton className="h-32" /> : toDeliver.length === 0 ? (
          <AppEmptyState icon={HandPlatter} title="Nada para levar agora" description="Quando algo ficar pronto, aparece aqui com um aviso sonoro." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {toDeliver.map((group) => (
              <article key={group.tableId} className="comanda flex flex-col gap-3 p-4 pl-5" data-tone="ready">
                <header className="flex items-start justify-between gap-2">
                  <h3 className="text-2xl font-bold leading-none">Mesa {group.tableNumber}</h3>
                  <span className="text-sm text-[hsl(var(--foreground-muted))]">{now ? elapsedLabel(group.since, now) : ""}</span>
                </header>
                <ul className="space-y-1.5">
                  {group.orders.flatMap((order) => order.items.map((item, index) => (
                    <li key={`${order.id}-${index}`} className="flex items-start gap-2 text-base">
                      {order.station === "ready" ? <CupSoda className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--success))]" aria-label="Pronta entrega" /> : <ChefHat className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" aria-label="Da cozinha" />}
                      <span><span className="num font-bold">{item.quantity}x</span> {item.nameSnapshot}{item.options?.length ? <span className="block text-sm text-[hsl(var(--foreground-muted))]">{formatOptions(item.options)}</span> : null}{item.notes ? <span className="text-sm text-[hsl(var(--foreground-muted))]"> ({item.notes})</span> : null}</span>
                    </li>
                  )))}
                </ul>
                <AppActionButton variant="success" className="h-12 w-full gap-2 text-base" disabled={busyTable === group.tableId} onClick={() => void deliverAll(group)}>{busyTable === group.tableId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-5 w-5" />}Levei à mesa</AppActionButton>
              </article>
            ))}
          </div>
        )}
      </AppSectionCard>

      <AppSectionCard icon={ChefHat} tone="warning" title="Ainda na cozinha" description="Para responder quando o cliente perguntar pelo prato.">
        {waiting.length === 0 ? <p className="text-sm text-[hsl(var(--foreground-muted))]">Nada sendo preparado agora.</p> : (
          <ul className="divide-y divide-[hsl(var(--border))]">
            {waiting.map((group) => {
              const items = group.orders.reduce((sum, order) => sum + order.items.reduce((acc, item) => acc + item.quantity, 0), 0);
              const minutes = now ? Math.floor((now - new Date(group.since).getTime()) / 60000) : 0;
              return (
                <li key={group.tableId} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={`/dashboard/mesas/${group.tableId}` as Route} className="min-w-0">
                    <p className="font-semibold">Mesa {group.tableNumber}</p>
                    <p className="truncate text-sm text-[hsl(var(--foreground-muted))]">{group.orders.flatMap((order) => order.items.map(describeOrderItem)).join(", ")}</p>
                  </Link>
                  <span className={cn("num shrink-0 rounded-full px-2.5 py-0.5 text-sm font-semibold", minutes >= 20 ? "bg-[hsl(var(--danger)/0.12)] text-[hsl(var(--danger))]" : "bg-[hsl(var(--gema)/0.18)] text-[hsl(var(--warning))]")}>{items} {items === 1 ? "item" : "itens"} · {minutes} min</span>
                </li>
              );
            })}
          </ul>
        )}
      </AppSectionCard>
    </section>
  );
}
