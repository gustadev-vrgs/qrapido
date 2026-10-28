"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, EyeOff, LayoutList, ListChecks, Loader2, Plus, Sparkles, UtensilsCrossed } from "lucide-react";

import { CategoryManager } from "@/components/menu/category-manager";
import { ItemEditor } from "@/components/menu/item-editor";
import { AppActionButton, AppChips, AppEmptyState, AppSearchInput, AppSkeleton, AppSurface } from "@/components/ui/app-design-system";
import { describeFirebaseError } from "@/lib/data/errors";
import { MenuService } from "@/lib/data/services/menu-service";
import { useAdminApi } from "@/lib/hooks/use-admin-api";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import type { MenuCategory, MenuItem } from "@/lib/types/domain";
import { categoryIcon } from "@/lib/utils/category-icon";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/formatters";
import { describeDays, isServedOn, restaurantWeekday } from "@/lib/utils/menu-options";
import { appToast } from "@/lib/utils/toast";

type Filter = "all" | "soldout" | "today" | "hidden";

export default function CardapioPage(): JSX.Element {
  const { user } = useAdminAuth();
  const api = useAdminApi();
  const menuService = useMemo(() => new MenuService({ scope: "admin" }), []);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<{ item: MenuItem | null; categoryId?: string } | null>(null);
  const [managingCategories, setManagingCategories] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [weekday, setWeekday] = useState<number | null>(null);

  useEffect(() => { setWeekday(restaurantWeekday()); }, []);

  const load = useCallback(async () => {
    if (!user?.restaurantId) return;
    try {
      const [fetchedCategories, fetchedItems] = await Promise.all([menuService.listCategories(user.restaurantId), menuService.listItems(user.restaurantId)]);
      setCategories(fetchedCategories.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR")));
      setItems(fetchedItems.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR")));
    } catch (error) {
      appToast.error("Não foi possível carregar o cardápio", describeFirebaseError(error));
    } finally {
      setLoading(false);
    }
  }, [menuService, user?.restaurantId]);

  useEffect(() => { void load(); }, [load]);

  const [addingSample, setAddingSample] = useState(false);
  const addSample = async () => {
    setAddingSample(true);
    try {
      const result = await api<{ createdItems: number; createdCategories: number }>("/api/admin/menu/sample", {});
      if (result.createdItems) appToast.success("Cardápio de exemplo adicionado", `${result.createdItems} itens com foto. Toque em um item para mudar preço, nome ou foto.`);
      else appToast.info("Nada novo para adicionar", "Os itens de exemplo já estão no seu cardápio.");
      await load();
    } catch (failure) {
      appToast.error("Não foi possível adicionar", failure instanceof Error ? failure.message : "Tente novamente.");
    } finally {
      setAddingSample(false);
    }
  };

  const toggleAvailable = async (item: MenuItem) => {
    const next = !item.isAvailable;
    setToggling(item.id);
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, isAvailable: next } : entry)));
    try {
      await api("/api/admin/menu/availability", { itemId: item.id, isAvailable: next });
      appToast.success(next ? `${item.name} voltou` : `${item.name} esgotado`, next ? "Já aparece para os clientes." : "Sumiu do cardápio dos clientes até você marcar que voltou.");
    } catch (failure) {
      setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, isAvailable: !next } : entry)));
      appToast.error("Não foi possível mudar", failure instanceof Error ? failure.message : "Tente novamente.");
    } finally {
      setToggling(null);
    }
  };

  const term = search.trim().toLowerCase();
  const visible = items.filter((item) => {
    if (filter === "soldout" && item.isAvailable) return false;
    if (filter === "hidden" && item.isActive) return false;
    if (filter === "today" && (weekday === null || !(item.availableDays?.length) || !isServedOn(item.availableDays, weekday))) return false;
    return !term || `${item.name} ${item.description}`.toLowerCase().includes(term);
  });
  const counts = {
    all: items.length,
    soldout: items.filter((item) => !item.isAvailable).length,
    today: weekday === null ? 0 : items.filter((item) => item.availableDays?.length && isServedOn(item.availableDays, weekday)).length,
    hidden: items.filter((item) => !item.isActive).length
  };
  const itemCount = items.reduce<Record<string, number>>((acc, item) => { acc[item.categoryId] = (acc[item.categoryId] ?? 0) + 1; return acc; }, {});
  const knownCategories = new Set(categories.map((category) => category.id));
  const sections = [
    ...categories.map((category) => ({ id: category.id, name: category.name, hidden: !category.isActive, items: visible.filter((item) => item.categoryId === category.id) })),
    { id: "orphan", name: "Sem categoria", hidden: true, items: visible.filter((item) => !knownCategories.has(item.categoryId)) }
  ].filter((section) => section.items.length > 0 || (filter === "all" && !term && section.id !== "orphan"));

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <AppSearchInput className="w-full lg:max-w-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar prato ou bebida" />
        <AppChips className="min-w-0 flex-1" value={filter} onChange={setFilter} options={[
          { value: "all", label: "Tudo", count: counts.all },
          { value: "soldout", label: "Esgotados", count: counts.soldout },
          ...(counts.today ? [{ value: "today" as const, label: "Prato do dia", count: counts.today }] : []),
          ...(counts.hidden ? [{ value: "hidden" as const, label: "Escondidos", count: counts.hidden }] : [])
        ]} />
        <div className="flex gap-2">
          <AppActionButton variant="secondary" className="gap-2" onClick={() => setManagingCategories(true)}><LayoutList className="h-4 w-4" />Categorias</AppActionButton>
          <AppActionButton className="gap-2" disabled={!categories.length} onClick={() => setEditing({ item: null })}><Plus className="h-4 w-4" />Novo item</AppActionButton>
        </div>
      </div>

      {!loading && categories.length > 0 && items.length === 0 ? (
        <AppSurface className="flex flex-wrap items-center gap-3 border-[hsl(var(--primary)/0.35)] bg-[hsl(var(--primary-soft))] p-4">
          <Sparkles className="h-5 w-5 text-[hsl(var(--primary))]" />
          <p className="min-w-0 flex-1 text-sm">Ainda sem itens. Quer começar com 5 pratos feitos e bebidas, já com fotos? Depois é só ajustar.</p>
          <AppActionButton className="gap-2" disabled={addingSample} onClick={() => void addSample()}>{addingSample ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Usar cardápio de exemplo</AppActionButton>
        </AppSurface>
      ) : null}

      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((index) => <AppSkeleton key={index} className="h-24" />)}</div>
      ) : categories.length === 0 ? (
        <AppEmptyState icon={UtensilsCrossed} title="Monte o seu cardápio" description="Comece com o cardápio de exemplo (5 pratos feitos e bebidas, com fotos) e ajuste preços e nomes, ou crie tudo do zero." action={<div className="flex flex-wrap justify-center gap-2"><AppActionButton className="gap-2" disabled={addingSample} onClick={() => void addSample()}>{addingSample ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Usar cardápio de exemplo</AppActionButton><AppActionButton variant="secondary" className="gap-2" onClick={() => setManagingCategories(true)}><Plus className="h-4 w-4" />Criar do zero</AppActionButton></div>} />
      ) : sections.length === 0 ? (
        <AppEmptyState title="Nada encontrado" description="Tente outra busca ou outro filtro." />
      ) : (
        sections.map((section) => (
          <AppSurface key={section.id} className="overflow-hidden p-0">
            <header className="flex items-center justify-between gap-3 border-b border-[hsl(var(--border))] px-4 py-3">
              <h2 className="flex items-center gap-2 text-lg"><span aria-hidden="true">{categoryIcon(section.name)}</span>{section.name}{section.hidden && section.id !== "orphan" ? <span className="rounded-full bg-[hsl(var(--surface-muted))] px-2 py-0.5 text-xs font-semibold text-[hsl(var(--foreground-muted))]">escondida</span> : null}</h2>
              {section.id !== "orphan" ? <AppActionButton variant="ghost" className="h-9 gap-1.5" onClick={() => setEditing({ item: null, categoryId: section.id })}><Plus className="h-4 w-4" />Item</AppActionButton> : null}
            </header>
            {section.items.length === 0 ? <p className="px-4 py-4 text-sm text-[hsl(var(--foreground-muted))]">Nenhum item nesta categoria.</p> : (
              <ul className="divide-y divide-[hsl(var(--border))]">
                {section.items.map((item) => {
                  const groups = item.optionGroups?.length ?? 0;
                  const daily = Boolean(item.availableDays?.length);
                  return (
                    <li key={item.id} className={cn("flex items-center gap-3 px-3 py-2.5 sm:px-4", !item.isActive ? "opacity-60" : "")}>
                      <button type="button" onClick={() => setEditing({ item })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[hsl(var(--primary-soft))]">
                          {item.imageUrl ? <Image src={item.imageUrl} alt="" fill sizes="56px" className={cn("object-cover", !item.isAvailable ? "grayscale" : "")} unoptimized /> : <span className={cn("text-2xl", !item.isAvailable ? "grayscale" : "")} aria-hidden="true">{categoryIcon(section.name)}</span>}
                        </span>
                        <span className="min-w-0">
                          <span className={cn("block truncate font-semibold", !item.isAvailable ? "line-through decoration-[hsl(var(--danger))]" : "")}>{item.name}</span>
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-[hsl(var(--foreground-muted))]">
                            <span className="num font-medium text-[hsl(var(--foreground))]">{formatCurrency(item.price)}</span>
                            {groups ? <span className="inline-flex items-center gap-1"><ListChecks className="h-3.5 w-3.5" />{groups} {groups === 1 ? "opção" : "opções"}</span> : null}
                            {daily ? <span className="inline-flex items-center gap-1 text-[hsl(var(--warning))]"><CalendarDays className="h-3.5 w-3.5" />{describeDays(item.availableDays)}</span> : null}
                            {item.isFeatured ? <span className="inline-flex items-center gap-1 text-[hsl(var(--warning))]"><Sparkles className="h-3.5 w-3.5" />Destaque</span> : null}
                            {!item.isActive ? <span className="inline-flex items-center gap-1"><EyeOff className="h-3.5 w-3.5" />Escondido</span> : null}
                          </span>
                        </span>
                      </button>
                      <button type="button" aria-pressed={!item.isAvailable} disabled={toggling === item.id} onClick={() => void toggleAvailable(item)} className={cn("inline-flex h-10 min-w-[104px] shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors", item.isAvailable ? "border-[hsl(var(--success)/0.4)] bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]" : "border-[hsl(var(--danger)/0.45)] bg-[hsl(var(--danger)/0.1)] text-[hsl(var(--danger))]")}>
                        {toggling === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className={cn("h-2 w-2 rounded-full", item.isAvailable ? "bg-[hsl(var(--success))]" : "bg-[hsl(var(--danger))]")} />}
                        {item.isAvailable ? "Tem" : "Esgotado"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </AppSurface>
        ))
      )}

      {editing && user?.restaurantId ? <ItemEditor item={editing.item} categories={categories} defaultCategoryId={editing.categoryId} nextSortOrder={items.length} restaurantId={user.restaurantId} onClose={() => setEditing(null)} onSaved={() => void load()} /> : null}
      {managingCategories && user?.restaurantId ? <CategoryManager categories={categories} itemCount={itemCount} restaurantId={user.restaurantId} onClose={() => setManagingCategories(false)} onChanged={load} /> : null}
    </section>
  );
}
