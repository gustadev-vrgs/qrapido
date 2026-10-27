"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArchiveRestore, ArrowLeft, ChefHat, Copy, CupSoda, DoorOpen, Edit2, History, KeyRound, Loader2, Power, QrCode, ReceiptText, RefreshCw, Trash2, TriangleAlert, Users, Wallet } from "lucide-react";

import { ArchiveTableDialog, CloseTableDialog, CodeDialog, OpenTableDialog, QrDialog, TableFormDialog } from "@/components/tables/table-dialogs";
import { TableHistory } from "@/components/tables/table-history";
import { AppActionButton, AppEmptyState, AppSectionCard, AppSkeleton, AppStatusBadge, AppSurface } from "@/components/ui/app-design-system";
import { useAdminApi } from "@/lib/hooks/use-admin-api";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import { useLiveTables } from "@/lib/hooks/use-live-tables";
import { useSessionOrders } from "@/lib/hooks/use-session-orders";
import { paymentMethodLabels } from "@/lib/constants/status-labels";
import { TablesService } from "@/lib/data/services/tables-service";
import type { Order } from "@/lib/types/domain";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatTime } from "@/lib/utils/formatters";
import { buildBill, elapsedLabel, formatAccessCode, TABLE_VIEW_META, tableViewOf, timeLeft } from "@/lib/utils/table-view";
import { appToast } from "@/lib/utils/toast";

const STATUS_TEXT: Record<Order["status"], { label: string; className: string }> = {
  received: { label: "Na cozinha", className: "bg-[hsl(var(--gema)/0.2)] text-[hsl(var(--warning))]" },
  confirmed: { label: "Na cozinha", className: "bg-[hsl(var(--gema)/0.2)] text-[hsl(var(--warning))]" },
  in_preparation: { label: "Na cozinha", className: "bg-[hsl(var(--gema)/0.2)] text-[hsl(var(--warning))]" },
  ready: { label: "Pronto p/ levar", className: "bg-[hsl(var(--success)/0.14)] text-[hsl(var(--success))]" },
  delivered: { label: "Entregue", className: "bg-[hsl(var(--surface-muted))] text-[hsl(var(--foreground-muted))]" },
  cancelled: { label: "Cancelado", className: "bg-[hsl(var(--danger)/0.1)] text-[hsl(var(--danger))]" }
};

type Dialog = "open" | "close" | "edit" | "archive" | "qr" | null;

export default function MesaDetailPage({ params }: { params: { tableId: string } }): JSX.Element {
  const { user } = useAdminAuth();
  const api = useAdminApi();
  const canManage = user?.role === "admin" || user?.role === "manager";
  const canOperate = canManage || user?.role === "attendant";
  const { tables, sessionByTable, loading } = useLiveTables(user?.restaurantId);
  const table = tables.find((item) => item.id === params.tableId) ?? null;
  const session = table ? sessionByTable[table.id] : undefined;
  const { orders, loading: ordersLoading } = useSessionOrders(user?.restaurantId, session?.id);

  const [now, setNow] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [codeShown, setCodeShown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (loading) return <div className="space-y-4"><AppSkeleton className="h-40" /><AppSkeleton className="h-64" /></div>;
  if (!table) {
    return <AppEmptyState icon={TriangleAlert} title="Mesa não encontrada" description="Ela pode ter sido apagada ou o link está errado." action={<Link href="/dashboard/mesas"><AppActionButton variant="secondary">Voltar para Mesas</AppActionButton></Link>} />;
  }

  const view = tableViewOf(table, session, now || undefined);
  const live = Boolean(session) && (view === "occupied" || view === "expired");
  const bill = buildBill(orders);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      appToast.success(success);
    } catch (failure) {
      appToast.error("Não foi possível concluir", failure instanceof Error ? failure.message : "Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  const newCode = async () => {
    setBusy(true);
    try {
      const result = await api<{ attendanceCode: string }>("/api/admin/table/code", { tableId: table.id });
      setCodeShown(result.attendanceCode);
    } catch (failure) {
      appToast.error("Não foi possível gerar o código", failure instanceof Error ? failure.message : "Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  const copyCode = () => {
    const code = session?.staffAccessCode ?? "";
    void navigator.clipboard?.writeText(code).then(() => appToast.success("Código copiado")).catch(() => appToast.info("Código", code));
  };

  return (
    <section className="space-y-4">
      <Link href="/dashboard/mesas" className="inline-flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--foreground))]"><ArrowLeft className="h-4 w-4" />Mesas</Link>

      <AppSurface variant="strong" className={cn("overflow-hidden p-0", live ? "border-[hsl(var(--primary)/0.4)]" : "")}>
        <div className="flex flex-wrap items-center gap-4 p-4 md:p-5">
          <span className="num inline-flex h-14 min-w-14 items-center justify-center rounded-2xl bg-[hsl(var(--foreground))] px-3 text-2xl font-bold text-[hsl(var(--background))]">{table.number}</span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-2xl">{table.label}</h2>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[hsl(var(--foreground-muted))]">
              <AppStatusBadge tone={TABLE_VIEW_META[view].tone}>{TABLE_VIEW_META[view].label}</AppStatusBadge>
              {live && session ? <><span className="inline-flex items-center gap-1"><Users className="h-4 w-4" />{session.peopleCount}</span><span>aberta {formatTime(session.startedAt)} · {now ? timeLeft(session, now) : ""}</span></> : <span>{table.capacity} lugares</span>}
            </p>
          </div>
          {view === "free" && canOperate ? <AppActionButton className="h-12 w-full gap-2 text-base sm:w-auto" onClick={() => setDialog("open")}><DoorOpen className="h-5 w-5" />Abrir mesa</AppActionButton> : null}
        </div>

        {live && session ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary-soft))] px-4 py-3 md:px-5">
            <div>
              <p className="text-xs text-[hsl(var(--foreground-muted))]">Código para os clientes</p>
              <p className="num text-3xl font-bold tracking-[0.18em]">{formatAccessCode(session.staffAccessCode)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {session.staffAccessCode ? <AppActionButton variant="secondary" className="gap-2" onClick={copyCode}><Copy className="h-4 w-4" />Copiar</AppActionButton> : null}
              {canOperate ? <AppActionButton variant="secondary" className="gap-2" disabled={busy} onClick={() => void newCode()}><KeyRound className="h-4 w-4" />Novo código</AppActionButton> : null}
              {canOperate && view === "expired" ? <AppActionButton className="gap-2" disabled={busy} onClick={() => void run(() => api("/api/admin/table/session", { tableId: table.id, action: "renew" }), "Atendimento renovado")}><RefreshCw className="h-4 w-4" />Renovar tempo</AppActionButton> : null}
            </div>
          </div>
        ) : null}
      </AppSurface>

      {live ? (
        <AppSectionCard icon={Wallet} tone="success" title="Conta da mesa" description={bill.orders.length ? `${bill.orders.filter((order) => order.status !== "cancelled").length} pedido(s) neste atendimento` : "Nenhum pedido ainda."}>
          {ordersLoading ? <AppSkeleton className="h-32" /> : (
            <div className="space-y-2">
              {bill.orders.map((order) => (
                <div key={order.id} className={cn("rounded-[var(--radius-md)] border border-[hsl(var(--border))] p-3", order.status === "cancelled" ? "opacity-60" : "")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-sm"><span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[hsl(var(--surface-muted))]">{order.station === "ready" ? <CupSoda className="h-4 w-4" /> : <ChefHat className="h-4 w-4" />}</span><span className="num font-semibold">{order.orderCode}</span><span className="text-[hsl(var(--foreground-muted))]">{formatTime(order.receivedAt)}{order.customerName ? ` · ${order.customerName}` : ""}</span></p>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_TEXT[order.status].className)}>{STATUS_TEXT[order.status].label}</span>
                  </div>
                  <ul className={cn("mt-2 space-y-0.5 text-sm", order.status === "cancelled" ? "line-through" : "")}>
                    {order.items.map((item, index) => <li key={index} className="flex justify-between gap-3"><span><span className="num font-semibold">{item.quantity}x</span> {item.nameSnapshot}{item.notes ? <span className="text-[hsl(var(--foreground-muted))]"> ({item.notes})</span> : null}</span><span className="num shrink-0">{formatCurrency(item.total)}</span></li>)}
                  </ul>
                  {order.status === "cancelled" && order.cancellationReason ? <p className="mt-1 text-xs text-[hsl(var(--danger))]">Cancelado: {order.cancellationReason}</p> : null}
                </div>
              ))}
              <div className="space-y-1 border-t border-[hsl(var(--border))] pt-3 text-sm">
                <p className="flex justify-between"><span>Subtotal</span><span className="num">{formatCurrency(bill.subtotal)}</span></p>
                {bill.serviceFee ? <p className="flex justify-between"><span>Taxa de serviço</span><span className="num">{formatCurrency(bill.serviceFee)}</span></p> : null}
                <p className="flex items-baseline justify-between pt-1"><span className="text-base font-semibold">Total</span><span className="num text-3xl font-bold">{formatCurrency(bill.total)}</span></p>
                {bill.suggestedMethod ? <p className="text-xs text-[hsl(var(--foreground-muted))]">Os clientes disseram que pagariam com {paymentMethodLabels[bill.suggestedMethod]}.</p> : null}
              </div>
              {canOperate ? <AppActionButton variant="success" className="h-12 w-full gap-2 text-base" onClick={() => setDialog("close")}><ReceiptText className="h-5 w-5" />Fechar conta e liberar mesa</AppActionButton> : null}
              {bill.kitchenPending ? <p className="text-center text-xs text-[hsl(var(--warning))]">{bill.kitchenPending} pedido(s) ainda na cozinha.</p> : null}
            </div>
          )}
        </AppSectionCard>
      ) : view === "expired" && canOperate ? (
        <AppSurface className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm">Esta mesa ficou marcada como ocupada sem um atendimento válido.</p>
          <AppActionButton variant="destructive" onClick={() => setDialog("close")}>Liberar mesa</AppActionButton>
        </AppSurface>
      ) : null}

      <AppSectionCard icon={QrCode} tone="neutral" title="Mesa" description="QR Code, dados e histórico.">
        <div className="flex flex-wrap gap-2">
          {view !== "archived" ? <AppActionButton variant="secondary" className="gap-2" onClick={() => setDialog("qr")}><QrCode className="h-4 w-4" />QR Code</AppActionButton> : null}
          {canManage ? <AppActionButton variant="secondary" className="gap-2" onClick={() => setDialog("edit")}><Edit2 className="h-4 w-4" />Editar</AppActionButton> : null}
          <AppActionButton variant="secondary" className="gap-2" aria-expanded={showHistory} onClick={() => setShowHistory((value) => !value)}><History className="h-4 w-4" />{showHistory ? "Esconder histórico" : "Histórico"}</AppActionButton>
          {canManage && view === "free" ? <AppActionButton variant="ghost" className="gap-2 text-[hsl(var(--danger))]" onClick={() => setDialog("archive")}><Trash2 className="h-4 w-4" />Excluir mesa</AppActionButton> : null}
          {canManage && view === "disabled" ? <AppActionButton variant="ghost" className="gap-2" disabled={busy} onClick={() => void run(() => new TablesService({ scope: "admin" }).update(table.id, { isActive: true, status: "free", currentSessionGroupId: null }), "Mesa ativada")}><Power className="h-4 w-4" />Ativar</AppActionButton> : null}
          {canManage && view === "archived" ? <AppActionButton className="gap-2" disabled={busy} onClick={() => void run(() => api("/api/admin/table/archive", { tableId: table.id, archived: false }), "Mesa restaurada")}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArchiveRestore className="h-4 w-4" />}Restaurar</AppActionButton> : null}
        </div>
        {showHistory && user?.restaurantId ? <div className="mt-4"><TableHistory table={table} restaurantId={user.restaurantId} /></div> : null}
        {live && session && now ? <p className="mt-3 text-xs text-[hsl(var(--foreground-muted))]">Aberta {elapsedLabel(session.startedAt, now)}.</p> : null}
      </AppSectionCard>

      {dialog === "open" ? <OpenTableDialog table={table} onClose={() => setDialog(null)} onOpened={(code) => { setDialog(null); setCodeShown(code); }} /> : null}
      {dialog === "close" ? <CloseTableDialog table={table} total={live ? bill.total : null} suggestedMethod={bill.suggestedMethod} hasSession={live} onClose={() => setDialog(null)} /> : null}
      {dialog === "edit" && user?.restaurantId ? <TableFormDialog table={table} tables={tables} restaurantId={user.restaurantId} onClose={() => setDialog(null)} /> : null}
      {dialog === "archive" ? <ArchiveTableDialog table={table} onClose={() => setDialog(null)} /> : null}
      {dialog === "qr" ? <QrDialog table={table} onClose={() => setDialog(null)} /> : null}
      {codeShown ? <CodeDialog table={table} code={codeShown} onClose={() => setCodeShown(null)} /> : null}
    </section>
  );
}
