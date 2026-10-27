"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, MessageSquarePlus, Minus, Plus, Send, TriangleAlert } from "lucide-react";

import { AppActionButton, AppEmptyState, AppSearchInput, AppSkeleton, AppSurface } from "@/components/ui/app-design-system";
import { MenuService } from "@/lib/data/services/menu-service";
import { useAdminApi } from "@/lib/hooks/use-admin-api";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import { useLiveTables } from "@/lib/hooks/use-live-tables";
import type { MenuCategory, MenuItem } from "@/lib/types/domain";
import { categoryIcon } from "@/lib/utils/category-icon";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/formatters";
import { randomKey } from "@/lib/utils/customer-storage";
import { appToast } from "@/lib/utils/toast";

interface Line { quantity: number; notes: string; showNotes: boolean }

/** The waiter takes the order on the phone for customers who prefer not to use theirs. */
export default function LancarPedidoPage({ params }: { params: { tableId: string } }): JSX.Element {
  const { user } = useAdminAuth();
  const api = useAdminApi();
  const router = useRouter();
  const { tables, sessionByTable, loading: tablesLoading } = useLiveTables(user?.restaurantId);
  const table = tables.find((item) => item.id === params.tableId) ?? null;
  const session = table ? sessionByTable[table.id] : undefined;
  const menuService = useMemo(() => new MenuService({ scope: "admin" }), []);

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [attemptKey, setAttemptKey] = useState("");

  useEffect(() => { setAttemptKey(randomKey()); }, []);
  useEffect(() => {
    if (!user?.restaurantId) return;
    let alive = true;
    Promise.all([menuService.listCategories(user.restaurantId), menuService.listItems(user.restaurantId)])
      .then(([loadedCategories, loadedItems]) => {
        if (!alive) return;
        const active = loadedCategories.filter((item) => item.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
        const position = new Map(active.map((item, index) => [item.id, index]));
        setCategories(active);
        // Grouped like the printed menu: category order, then the item order inside it.
        setItems(loadedItems.filter((item) => item.isActive && position.has(item.categoryId)).sort((a, b) => position.get(a.categoryId)! - position.get(b.categoryId)! || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR")));
      })
      .catch((failure) => alive && setMenuError(failure instanceof Error ? failure.message : "Não foi possível carregar o cardápio."))
      .finally(() => alive && setMenuLoading(false));
    return () => { alive = false; };
  }, [menuService, user?.restaurantId]);

  const categoryName = useMemo(() => new Map(categories.map((item) => [item.id, item.name])), [categories]);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => (category === "all" || item.categoryId === category) && (!term || `${item.name} ${item.description}`.toLowerCase().includes(term)));
  }, [items, category, search]);

  const chosen = items.filter((item) => (lines[item.id]?.quantity ?? 0) > 0);
  const count = chosen.reduce((sum, item) => sum + lines[item.id].quantity, 0);
  const subtotal = Math.round(chosen.reduce((sum, item) => sum + item.price * lines[item.id].quantity, 0) * 100) / 100;

  const change = (item: MenuItem, delta: number) => {
    if (!item.isAvailable && delta > 0) return;
    setLines((current) => {
      const line = current[item.id] ?? { quantity: 0, notes: "", showNotes: false };
      const quantity = Math.max(0, Math.min(50, line.quantity + delta));
      return { ...current, [item.id]: { ...line, quantity } };
    });
  };
  const patch = (id: string, value: Partial<Line>) => setLines((current) => ({ ...current, [id]: { ...(current[id] ?? { quantity: 0, notes: "", showNotes: false }), ...value } }));

  const send = async () => {
    if (!table || !count || sending) return;
    setSending(true);
    try {
      const result = await api<{ groupCode: string; orders: Array<{ station: string }> }>("/api/admin/order/create", {
        tableId: table.id,
        items: chosen.map((item) => ({ menuItemId: item.id, quantity: lines[item.id].quantity, notes: lines[item.id].notes.trim() || null })),
        ...(notes.trim() ? { notes: notes.trim() } : {})
      }, "POST", { "Idempotency-Key": attemptKey });
      const kitchen = result.orders.some((order) => order.station === "kitchen");
      const drinks = result.orders.some((order) => order.station === "ready");
      appToast.success(`Pedido ${result.groupCode} lançado`, kitchen && drinks ? "Pratos na cozinha; bebidas em \"Levar à mesa\"." : kitchen ? "Já está na fila da cozinha." : "Já está em \"Levar à mesa\".");
      setLines({});
      setNotes("");
      setAttemptKey(randomKey());
      router.push(`/dashboard/mesas/${table.id}` as Route);
    } catch (failure) {
      appToast.error("Pedido não enviado", failure instanceof Error ? failure.message : "Tente novamente; o pedido não será duplicado.");
    } finally {
      setSending(false);
    }
  };

  if (tablesLoading) return <div className="space-y-3"><AppSkeleton className="h-12" /><AppSkeleton className="h-64" /></div>;
  if (!table) return <AppEmptyState icon={TriangleAlert} title="Mesa não encontrada" description="Volte para Mesas e escolha a mesa de novo." action={<Link href="/dashboard/mesas"><AppActionButton variant="secondary">Mesas</AppActionButton></Link>} />;
  if (!session) {
    return <AppEmptyState icon={TriangleAlert} title={`${table.label} não está aberta`} description="Abra a mesa antes de lançar um pedido." action={<Link href={`/dashboard/mesas/${table.id}` as Route}><AppActionButton>Ir para a mesa</AppActionButton></Link>} />;
  }

  return (
    <section className="space-y-4 pb-28">
      <Link href={`/dashboard/mesas/${table.id}` as Route} className="inline-flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--foreground))]"><ArrowLeft className="h-4 w-4" />{table.label}</Link>
      <h2 className="text-2xl">Pedido para a {table.label}</h2>

      <div className="sticky top-[57px] z-20 -mx-4 space-y-2 bg-[hsl(var(--background)/0.95)] px-4 py-2 backdrop-blur lg:top-[89px] lg:-mx-8 lg:px-8">
        <AppSearchInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar prato ou bebida" />
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          <button type="button" onClick={() => setCategory("all")} className={cn("h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium", category === "all" ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" : "border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))]")}>Tudo</button>
          {categories.map((item) => (
            <button key={item.id} type="button" onClick={() => setCategory(item.id)} className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium", category === item.id ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" : "border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))]")}><span aria-hidden="true">{categoryIcon(item.name)}</span>{item.name}</button>
          ))}
        </div>
      </div>

      {menuError ? <AppSurface className="p-4 text-sm text-[hsl(var(--danger))]">{menuError}</AppSurface> : null}
      {menuLoading ? <div className="space-y-2">{[0, 1, 2, 3].map((index) => <AppSkeleton key={index} className="h-16" />)}</div> : visible.length === 0 ? (
        <AppEmptyState title="Nada encontrado" description={items.length ? "Tente outra busca ou categoria." : "O cardápio está vazio. Cadastre pratos em Cardápio."} />
      ) : (
        <AppSurface className="divide-y divide-[hsl(var(--border))] overflow-hidden p-0">
          {visible.map((item) => {
            const line = lines[item.id];
            const quantity = line?.quantity ?? 0;
            return (
              <div key={item.id} className={cn("px-3 py-2.5 sm:px-4", quantity ? "bg-[hsl(var(--primary-soft))]" : "", !item.isAvailable ? "opacity-50" : "")}>
                <div className="flex items-center gap-3">
                  <button type="button" disabled={!item.isAvailable} onClick={() => change(item, 1)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="text-2xl" aria-hidden="true">{categoryIcon(categoryName.get(item.categoryId))}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{item.name}</span>
                      <span className="num text-sm text-[hsl(var(--foreground-muted))]">{item.isAvailable ? formatCurrency(item.price) : "Esgotado"}</span>
                    </span>
                  </button>
                  {quantity ? (
                    <div className="flex items-center gap-1">
                      <button type="button" aria-label={`Tirar um ${item.name}`} onClick={() => change(item, -1)} className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))]"><Minus className="h-4 w-4" /></button>
                      <span className="num w-8 text-center text-lg font-bold">{quantity}</span>
                      <button type="button" aria-label={`Mais um ${item.name}`} onClick={() => change(item, 1)} className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><Plus className="h-4 w-4" /></button>
                    </div>
                  ) : item.isAvailable ? (
                    <button type="button" aria-label={`Adicionar ${item.name}`} onClick={() => change(item, 1)} className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))]"><Plus className="h-4 w-4" /></button>
                  ) : null}
                </div>
                {quantity ? (
                  line?.showNotes ? (
                    <input autoFocus className="app-field mt-2 h-10" maxLength={180} value={line.notes} onChange={(event) => patch(item.id, { notes: event.target.value })} placeholder="Observação (ex.: sem cebola)" />
                  ) : (
                    <button type="button" onClick={() => patch(item.id, { showNotes: true })} className="mt-1 inline-flex items-center gap-1 text-sm text-[hsl(var(--primary))]"><MessageSquarePlus className="h-4 w-4" />Observação</button>
                  )
                ) : null}
              </div>
            );
          })}
        </AppSurface>
      )}

      {count ? <input className="app-field" maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Observação geral do pedido (opcional)" /> : null}

      {count ? (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-40 px-3 lg:bottom-4 lg:left-[248px] lg:px-8">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[hsl(var(--border))] bg-[hsl(var(--background-elevated))] p-3 shadow-[0_8px_30px_-12px_hsl(217_28%_15%/0.35)]">
            <p className="text-sm"><strong className="num">{count}</strong> {count === 1 ? "item" : "itens"}<br /><span className="num text-[hsl(var(--foreground-muted))]">{formatCurrency(subtotal)} + taxa</span></p>
            <AppActionButton className="h-12 gap-2 text-base" disabled={sending || !attemptKey} onClick={() => void send()}>{sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}Enviar pedido</AppActionButton>
          </div>
        </div>
      ) : null}
    </section>
  );
}
