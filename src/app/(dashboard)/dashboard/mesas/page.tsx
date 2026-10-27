"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { ArchiveRestore, DoorOpen, Plus, TriangleAlert } from "lucide-react";

import { CodeDialog, OpenTableDialog, TableFormDialog } from "@/components/tables/table-dialogs";
import { AppActionButton, AppChips, AppEmptyState, AppSkeleton, AppSurface } from "@/components/ui/app-design-system";
import { useAdminApi } from "@/lib/hooks/use-admin-api";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import { useLiveOrders } from "@/lib/hooks/use-live-orders";
import { useLiveTables } from "@/lib/hooks/use-live-tables";
import type { Table } from "@/lib/types/domain";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/formatters";
import { describePublicUrlProblem } from "@/lib/utils/public-url";
import { elapsedLabel, formatAccessCode, TABLE_VIEW_META, tableViewOf, type TableView } from "@/lib/utils/table-view";
import { appToast } from "@/lib/utils/toast";

type Filter = "floor" | "occupied" | "free" | "archived";

const TILE_STYLE: Record<TableView, string> = {
  free: "border-[hsl(var(--border))] bg-[hsl(var(--surface))]",
  occupied: "border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary-soft))]",
  expired: "border-[hsl(var(--warning)/0.55)] bg-[hsl(var(--gema)/0.12)]",
  disabled: "border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))]",
  archived: "border-dashed border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))] opacity-80"
};

const DOT: Record<TableView, string> = {
  free: "bg-[hsl(var(--success))]",
  occupied: "bg-[hsl(var(--primary))]",
  expired: "bg-[hsl(var(--gema))]",
  disabled: "bg-[hsl(var(--foreground-muted))]",
  archived: "bg-[hsl(var(--foreground-muted))]"
};

export default function MesasPage(): JSX.Element {
  const { user } = useAdminAuth();
  const api = useAdminApi();
  const canManage = user?.role === "admin" || user?.role === "manager";
  const canOperate = canManage || user?.role === "attendant";
  const { tables, sessionByTable, loading, error } = useLiveTables(user?.restaurantId);
  const { orders } = useLiveOrders(user?.restaurantId);

  const [filter, setFilter] = useState<Filter>("floor");
  const [now, setNow] = useState(0);
  const [urlProblem, setUrlProblem] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [opening, setOpening] = useState<Table | null>(null);
  const [codeShown, setCodeShown] = useState<{ table: Table; code: string } | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // Browser-only values are set after mount so server and client render the same HTML.
  useEffect(() => {
    setUrlProblem(describePublicUrlProblem());
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const views = useMemo(() => Object.fromEntries(tables.map((table) => [table.id, tableViewOf(table, sessionByTable[table.id], now || undefined)])) as Record<string, TableView>, [tables, sessionByTable, now]);
  const totals = useMemo(() => orders.reduce<Record<string, number>>((acc, order) => {
    if (order.status !== "cancelled") acc[order.sessionId] = (acc[order.sessionId] ?? 0) + order.total;
    return acc;
  }, {}), [orders]);
  const kitchenBySession = useMemo(() => orders.reduce<Record<string, number>>((acc, order) => {
    if (["received", "confirmed", "in_preparation"].includes(order.status)) acc[order.sessionId] = (acc[order.sessionId] ?? 0) + 1;
    return acc;
  }, {}), [orders]);

  const count = (match: (view: TableView) => boolean) => tables.filter((table) => match(views[table.id])).length;
  const filtered = tables.filter((table) => {
    const view = views[table.id];
    if (filter === "archived") return view === "archived";
    if (filter === "occupied") return view === "occupied" || view === "expired";
    if (filter === "free") return view === "free";
    return view !== "archived";
  });

  const restore = async (table: Table) => {
    setRestoringId(table.id);
    try {
      await api("/api/admin/table/archive", { tableId: table.id, archived: false });
      appToast.success("Mesa restaurada", `${table.label} voltou para o salão.`);
    } catch (failure) {
      appToast.error("Não foi possível restaurar", failure instanceof Error ? failure.message : "Tente novamente.");
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <section className="space-y-4">
      {urlProblem ? <AppSurface className="flex items-start gap-3 border-[hsl(var(--warning)/0.5)] p-4 text-sm"><TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--warning))]" /><p>{urlProblem}</p></AppSurface> : null}
      {error ? <AppSurface className="flex items-start gap-3 border-[hsl(var(--danger)/0.5)] p-4 text-sm"><TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--danger))]" /><p>{error}</p></AppSurface> : null}

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <AppChips className="min-w-0 flex-1" value={filter} onChange={setFilter} options={[
          { value: "floor", label: "Salão", count: count((view) => view !== "archived") },
          { value: "occupied", label: "Ocupadas", count: count((view) => view === "occupied" || view === "expired") },
          { value: "free", label: "Livres", count: count((view) => view === "free") },
          ...(count((view) => view === "archived") ? [{ value: "archived" as const, label: "Excluídas", count: count((view) => view === "archived") }] : [])
        ]} />
        {canManage && user?.restaurantId ? <AppActionButton variant="secondary" className="gap-2" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Nova mesa</AppActionButton> : null}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{Array.from({ length: 8 }).map((_, index) => <AppSkeleton key={index} className="h-40" />)}</div>
      ) : filtered.length === 0 ? (
        <AppEmptyState title={tables.length ? "Nenhuma mesa aqui" : "Nenhuma mesa cadastrada"} description={tables.length ? "Escolha outro filtro." : "Crie a primeira mesa em \"Nova mesa\", imprima o QR Code e cole na mesa."} action={!tables.length && canManage ? <AppActionButton className="gap-2" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Nova mesa</AppActionButton> : undefined} />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {filtered.map((table) => {
            const view = views[table.id];
            const session = sessionByTable[table.id];
            const live = Boolean(session) && (view === "occupied" || view === "expired");
            const kitchen = session ? kitchenBySession[session.id] ?? 0 : 0;
            const href = `/dashboard/mesas/${table.id}` as Route;
            return (
              <article key={table.id} className={cn("relative flex min-h-40 flex-col gap-2 rounded-[var(--radius-lg)] border p-3 transition-shadow hover:shadow-md sm:p-4", TILE_STYLE[view])}>
                <Link href={href} className="absolute inset-0 rounded-[var(--radius-lg)]" aria-label={`Ver ${table.label}`} />
                <header className="flex items-start justify-between gap-2">
                  <span className="num inline-flex h-10 min-w-10 items-center justify-center rounded-xl bg-[hsl(var(--foreground))] px-2 text-lg font-bold text-[hsl(var(--background))]">{table.number}</span>
                  <span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-[hsl(var(--foreground-muted))]"><span className={cn("h-2 w-2 rounded-full", DOT[view])} />{view === "expired" ? "Esgotada" : TABLE_VIEW_META[view].label}</span>
                </header>
                <h3 className="truncate text-base font-semibold">{table.label}</h3>
                {live && session ? (
                  <div className="mt-auto space-y-1">
                    <p className="num text-xl font-bold tracking-[0.12em]">{formatAccessCode(session.staffAccessCode)}</p>
                    <p className="text-xs text-[hsl(var(--foreground-muted))]">{session.peopleCount} pess. · {now ? elapsedLabel(session.startedAt, now) : ""}</p>
                    <p className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm"><strong className="num">{formatCurrency(totals[session.id] ?? 0)}</strong>{kitchen ? <span className="whitespace-nowrap rounded-full bg-[hsl(var(--gema)/0.22)] px-2 py-0.5 text-xs font-semibold text-[hsl(var(--warning))]">{kitchen} na cozinha</span> : null}</p>
                  </div>
                ) : view === "free" ? (
                  <div className="mt-auto space-y-2">
                    <p className="text-xs text-[hsl(var(--foreground-muted))]">{table.capacity} lugares</p>
                    {canOperate ? <AppActionButton className="relative z-10 h-11 w-full gap-2" onClick={() => setOpening(table)}><DoorOpen className="h-4 w-4" />Abrir</AppActionButton> : null}
                  </div>
                ) : view === "archived" && canManage ? (
                  <AppActionButton variant="secondary" className="relative z-10 mt-auto w-full gap-2" disabled={restoringId === table.id} onClick={() => void restore(table)}><ArchiveRestore className="h-4 w-4" />Restaurar</AppActionButton>
                ) : (
                  <p className="mt-auto text-xs text-[hsl(var(--foreground-muted))]">{view === "expired" ? "Sem atendimento válido: toque para liberar." : "Toque para ver."}</p>
                )}
              </article>
            );
          })}
        </div>
      )}

      {creating && user?.restaurantId ? <TableFormDialog table={null} tables={tables} restaurantId={user.restaurantId} onClose={() => setCreating(false)} /> : null}
      {opening ? <OpenTableDialog table={opening} onClose={() => setOpening(null)} onOpened={(code) => { setCodeShown({ table: opening, code }); setOpening(null); }} /> : null}
      {codeShown ? <CodeDialog table={codeShown.table} code={codeShown.code} onClose={() => setCodeShown(null)} /> : null}
    </section>
  );
}
