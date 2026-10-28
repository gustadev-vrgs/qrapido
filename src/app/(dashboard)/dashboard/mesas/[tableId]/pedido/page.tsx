"use client";

import Link from "next/link";
import type { Route } from "next";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, MessageSquarePlus, Minus, Plus, Send, TriangleAlert } from "lucide-react";

import { AppActionButton, AppEmptyState, AppSearchInput, AppSkeleton, AppSurface } from "@/components/ui/app-design-system";
import { AppModal } from "@/components/ui/app-modal";
import { MenuService } from "@/lib/data/services/menu-service";
import { useAdminApi } from "@/lib/hooks/use-admin-api";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import { useLiveTables } from "@/lib/hooks/use-live-tables";
import type { MenuCategory, MenuItem } from "@/lib/types/domain";
import { categoryIcon } from "@/lib/utils/category-icon";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/formatters";
import { randomKey } from "@/lib/utils/customer-storage";
import { groupRuleLabel, isServedOn, resolveChoices, restaurantWeekday } from "@/lib/utils/menu-options";
import { appToast } from "@/lib/utils/toast";

interface Line { itemId: string; quantity: number; notes: string; showNotes: boolean; options: Array<{ groupId: string; optionId: string }>; optionsLabel: string; unitPrice: number }

/** The waiter takes the order on the phone for customers who prefer not to use theirs. */
export default function LancarPedidoPage(): JSX.Element {
  const params = useParams<{ tableId: string }>();
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
  // Key: item id, plus the chosen options for items that have them (same dish, different side = different line).
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [picking, setPicking] = useState<MenuItem | null>(null);
  const [pickChoices, setPickChoices] = useState<Record<string, string[]>>({});
  const [pickError, setPickError] = useState("");
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
        // Items served only on other weekdays (prato do dia) are left out today.
        const today = restaurantWeekday();
        setItems(loadedItems.filter((item) => item.isActive && position.has(item.categoryId) && isServedOn(item.availableDays, today)).sort((a, b) => position.get(a.categoryId)! - position.get(b.categoryId)! || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR")));
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

  const chosen = Object.entries(lines).filter(([, line]) => line.quantity > 0);
  const count = chosen.reduce((sum, [, line]) => sum + line.quantity, 0);
  const subtotal = Math.round(chosen.reduce((sum, [, line]) => sum + line.unitPrice * line.quantity, 0) * 100) / 100;
  const hasOptions = (item: MenuItem) => (item.optionGroups?.length ?? 0) > 0;

  const changeLine = (key: string, delta: number) => setLines((current) => {
    const line = current[key];
    if (!line) return current;
    return { ...current, [key]: { ...line, quantity: Math.max(0, Math.min(50, line.quantity + delta)) } };
  });
  const change = (item: MenuItem, delta: number) => {
    if (!item.isAvailable && delta > 0) return;
    if (hasOptions(item) && delta > 0) { openPicker(item); return; }
    setLines((current) => {
      const line = current[item.id] ?? { itemId: item.id, quantity: 0, notes: "", showNotes: false, options: [], optionsLabel: "", unitPrice: item.price };
      return { ...current, [item.id]: { ...line, quantity: Math.max(0, Math.min(50, line.quantity + delta)) } };
    });
  };
  const patch = (key: string, value: Partial<Line>) => setLines((current) => (current[key] ? { ...current, [key]: { ...current[key], ...value } } : current));

  function openPicker(item: MenuItem) {
    setPicking(item);
    setPickError("");
    setPickChoices(Object.fromEntries((item.optionGroups ?? []).map((group) => [group.id, group.min === 1 && group.max === 1 ? [group.options[0].id] : []])));
  }
  function togglePick(groupId: string, optionId: string, max: number) {
    setPickError("");
    setPickChoices((current) => {
      const ids = current[groupId] ?? [];
      if (ids.includes(optionId)) return { ...current, [groupId]: ids.filter((id) => id !== optionId) };
      if (max === 1) return { ...current, [groupId]: [optionId] };
      return ids.length >= max ? current : { ...current, [groupId]: [...ids, optionId] };
    });
  }
  function confirmPick() {
    if (!picking) return;
    const picked = Object.entries(pickChoices).flatMap(([groupId, ids]) => ids.map((optionId) => ({ groupId, optionId })));
    const resolved = resolveChoices(picking.optionGroups ?? [], picked);
    if ("error" in resolved) { setPickError(resolved.group ? `Escolha em "${resolved.group}".` : "Revise as escolhas."); return; }
    const key = `${picking.id}|${picked.map((choice) => `${choice.groupId}:${choice.optionId}`).sort().join(",")}`;
    const item = picking;
    setLines((current) => {
      const line = current[key] ?? { itemId: item.id, quantity: 0, notes: "", showNotes: false, options: picked, optionsLabel: resolved.options.map((option) => option.name).join(", "), unitPrice: Math.round((item.price + resolved.extra) * 100) / 100 };
      return { ...current, [key]: { ...line, quantity: Math.min(50, line.quantity + 1) } };
    });
    setPicking(null);
  }

  const send = async () => {
    if (!table || !count || sending) return;
    setSending(true);
    try {
      const result = await api<{ groupCode: string; orders: Array<{ station: string }> }>("/api/admin/order/create", {
        tableId: table.id,
        items: chosen.map(([, line]) => ({ menuItemId: line.itemId, quantity: line.quantity, notes: line.notes.trim() || null, ...(line.options.length ? { options: line.options } : {}) })),
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
            const withOptions = hasOptions(item);
            const itemLines = Object.entries(lines).filter(([, line]) => line.itemId === item.id && line.quantity > 0);
            const quantity = itemLines.reduce((sum, [, line]) => sum + line.quantity, 0);
            const simple = !withOptions ? lines[item.id] : undefined;
            const stepper = (key: string, value: number, label: string) => (
              <div className="flex items-center gap-1">
                <button type="button" aria-label={`Tirar um ${label}`} onClick={() => changeLine(key, -1)} className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))]"><Minus className="h-4 w-4" /></button>
                <span className="num w-8 text-center text-lg font-bold">{value}</span>
                <button type="button" aria-label={`Mais um ${label}`} onClick={() => changeLine(key, 1)} className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><Plus className="h-4 w-4" /></button>
              </div>
            );
            const notesFor = (key: string, line: Line) => (line.showNotes
              ? <input autoFocus className="app-field mt-2 h-10" maxLength={180} value={line.notes} onChange={(event) => patch(key, { notes: event.target.value })} placeholder="Observação (ex.: sem cebola)" />
              : <button type="button" onClick={() => patch(key, { showNotes: true })} className="mt-1 inline-flex items-center gap-1 text-sm text-[hsl(var(--primary))]"><MessageSquarePlus className="h-4 w-4" />Observação</button>);
            return (
              <div key={item.id} className={cn("px-3 py-2.5 sm:px-4", quantity ? "bg-[hsl(var(--primary-soft))]" : "", !item.isAvailable ? "opacity-50" : "")}>
                <div className="flex items-center gap-3">
                  <button type="button" disabled={!item.isAvailable} onClick={() => change(item, 1)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="text-2xl" aria-hidden="true">{categoryIcon(categoryName.get(item.categoryId))}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{item.name}</span>
                      <span className="num text-sm text-[hsl(var(--foreground-muted))]">{item.isAvailable ? `${formatCurrency(item.price)}${withOptions ? " · com opções" : ""}` : "Esgotado"}</span>
                    </span>
                  </button>
                  {simple && simple.quantity ? stepper(item.id, simple.quantity, item.name) : item.isAvailable ? (
                    <button type="button" aria-label={`Adicionar ${item.name}`} onClick={() => change(item, 1)} className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))]"><Plus className="h-4 w-4" /></button>
                  ) : null}
                </div>
                {simple && simple.quantity ? notesFor(item.id, simple) : null}
                {withOptions ? itemLines.map(([key, line]) => (
                  <div key={key} className="mt-2 rounded-[var(--radius-md)] border border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--surface))] p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 text-sm"><span className="font-medium">{line.optionsLabel || "Sem opções"}</span><span className="num block text-xs text-[hsl(var(--foreground-muted))]">{formatCurrency(line.unitPrice)} cada</span></p>
                      {stepper(key, line.quantity, `${item.name} ${line.optionsLabel}`)}
                    </div>
                    {notesFor(key, line)}
                  </div>
                )) : null}
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
      {picking ? (
        <AppModal title={picking.name} onClose={() => setPicking(null)}>
          {(picking.optionGroups ?? []).map((group) => (
            <fieldset key={group.id} className="space-y-1.5">
              <legend className="flex w-full items-center justify-between gap-2 pb-1"><span className="font-semibold">{group.name}</span><span className="text-xs text-[hsl(var(--foreground-muted))]">{groupRuleLabel(group)}</span></legend>
              <div className="grid grid-cols-2 gap-1.5">
                {group.options.map((option) => {
                  const active = (pickChoices[group.id] ?? []).includes(option.id);
                  return <button key={option.id} type="button" aria-pressed={active} onClick={() => togglePick(group.id, option.id, group.max)} className={cn("min-h-11 rounded-[var(--radius-md)] border px-2 py-1.5 text-left text-sm", active ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] font-semibold text-[hsl(var(--primary-foreground))]" : "border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))]")}>{option.name}{option.price > 0 ? <span className="num block text-xs opacity-80">+{formatCurrency(option.price)}</span> : null}</button>;
                })}
              </div>
            </fieldset>
          ))}
          {pickError ? <p className="text-sm text-[hsl(var(--danger))]">{pickError}</p> : null}
          <AppActionButton className="h-12 w-full gap-2 text-base" onClick={confirmPick}><Plus className="h-5 w-5" />Adicionar</AppActionButton>
        </AppModal>
      ) : null}
    </section>
  );
}
