"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, PencilLine, Plus } from "lucide-react";

import { AppActionButton, AppTextInput } from "@/components/ui/app-design-system";
import { AppModal } from "@/components/ui/app-modal";
import { describeFirebaseError } from "@/lib/data/errors";
import { MenuService } from "@/lib/data/services/menu-service";
import { refreshCustomerMenu, useAdminApi } from "@/lib/hooks/use-admin-api";
import type { MenuCategory } from "@/lib/types/domain";
import { categoryIcon } from "@/lib/utils/category-icon";
import { cn } from "@/lib/utils/cn";
import { appToast } from "@/lib/utils/toast";

function slugify(value: string): string {
  const slug = value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-");
  return slug.length >= 2 ? slug.slice(0, 80) : `cat-${slug || Date.now().toString(36)}`;
}

const SUGGESTIONS = ["Pratos feitos", "Marmitas", "Porções", "Bebidas", "Sobremesas"];

/** Create, rename, hide and reorder the menu sections in one place. */
export function CategoryManager({ categories, itemCount, restaurantId, onClose, onChanged }: { categories: MenuCategory[]; itemCount: Record<string, number>; restaurantId: string; onClose: () => void; onChanged: () => Promise<void> | void }): JSX.Element {
  const service = useMemo(() => new MenuService({ scope: "admin" }), []);
  const ordered = [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR"));
  const api = useAdminApi();
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, action: () => Promise<unknown>, success?: string) => {
    setBusy(key);
    try {
      await action();
      await refreshCustomerMenu(api);
      await onChanged();
      if (success) appToast.success(success);
    } catch (failure) {
      appToast.error("Não foi possível salvar", failure instanceof Error && failure.name === "FirebaseError" ? describeFirebaseError(failure) : failure instanceof Error ? failure.message : "Tente novamente.");
    } finally {
      setBusy(null);
    }
  };

  const create = (name: string) => {
    const clean = name.trim();
    if (clean.length < 2) return appToast.error("Nome curto demais", "Use pelo menos 2 letras.");
    if (ordered.some((category) => category.name.trim().toLowerCase() === clean.toLowerCase())) return appToast.error("Já existe", `A categoria "${clean}" já está no cardápio.`);
    void run("new", () => service.createCategory({ restaurantId, name: clean.slice(0, 80), slug: slugify(clean), description: "", sortOrder: (ordered.at(-1)?.sortOrder ?? -1) + 1, isActive: true }), "Categoria criada").then(() => setNewName(""));
  };

  // Swaps positions and renumbers everything, so old duplicated orders get fixed too.
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= ordered.length) return;
    const next = [...ordered];
    [next[index], next[target]] = [next[target], next[index]];
    void run(`move-${ordered[index].id}`, () => Promise.all(next.map((category, position) => (category.sortOrder === position ? Promise.resolve() : service.updateCategory(category.id, { sortOrder: position })))));
  };

  return (
    <AppModal title="Categorias do cardápio" onClose={onClose}>
      <ul className="divide-y divide-[hsl(var(--border))] rounded-[var(--radius-md)] border border-[hsl(var(--border))]">
        {ordered.map((category, index) => (
          <li key={category.id} className={cn("flex items-center gap-2 px-3 py-2", category.isActive ? "" : "opacity-60")}>
            <span className="text-xl" aria-hidden="true">{categoryIcon(category.name)}</span>
            {editing?.id === category.id ? (
              <form className="flex min-w-0 flex-1 gap-2" onSubmit={(event) => { event.preventDefault(); const name = editing.name.trim(); if (name.length >= 2) void run(category.id, () => service.updateCategory(category.id, { name: name.slice(0, 80), slug: slugify(name) }), "Categoria renomeada").then(() => setEditing(null)); }}>
                <AppTextInput autoFocus className="h-9" value={editing.name} maxLength={80} onChange={(event) => setEditing({ ...editing, name: event.target.value })} aria-label="Novo nome" />
                <AppActionButton type="submit" className="h-9" disabled={busy === category.id}>Salvar</AppActionButton>
              </form>
            ) : (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{category.name}</span>
                  <span className="text-xs text-[hsl(var(--foreground-muted))]">{itemCount[category.id] ?? 0} item(ns){category.isActive ? "" : " · escondida"}</span>
                </span>
                <button type="button" aria-label="Subir" disabled={index === 0 || busy !== null} onClick={() => move(index, -1)} className="rounded-lg p-2 hover:bg-[hsl(var(--surface-muted))] disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" aria-label="Descer" disabled={index === ordered.length - 1 || busy !== null} onClick={() => move(index, 1)} className="rounded-lg p-2 hover:bg-[hsl(var(--surface-muted))] disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                <button type="button" aria-label="Renomear" onClick={() => setEditing({ id: category.id, name: category.name })} className="rounded-lg p-2 hover:bg-[hsl(var(--surface-muted))]"><PencilLine className="h-4 w-4" /></button>
                <button type="button" aria-label={category.isActive ? "Esconder do cardápio" : "Mostrar no cardápio"} disabled={busy !== null} onClick={() => void run(category.id, () => service.updateCategory(category.id, { isActive: !category.isActive }), category.isActive ? "Categoria escondida" : "Categoria visível")} className="rounded-lg p-2 hover:bg-[hsl(var(--surface-muted))]">{category.isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
              </>
            )}
          </li>
        ))}
        {ordered.length === 0 ? <li className="px-3 py-4 text-sm text-[hsl(var(--foreground-muted))]">Nenhuma categoria ainda.</li> : null}
      </ul>

      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); create(newName); }}>
        <AppTextInput value={newName} maxLength={80} onChange={(event) => setNewName(event.target.value)} placeholder="Nova categoria, ex.: Pratos feitos" aria-label="Nome da nova categoria" />
        <AppActionButton type="submit" className="gap-1.5" disabled={busy === "new"}>{busy === "new" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Criar</AppActionButton>
      </form>
      {SUGGESTIONS.some((name) => !ordered.some((category) => category.name.toLowerCase() === name.toLowerCase())) ? (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.filter((name) => !ordered.some((category) => category.name.toLowerCase() === name.toLowerCase())).map((name) => (
            <button key={name} type="button" disabled={busy !== null} onClick={() => create(name)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-[hsl(var(--border-strong))] px-3 py-1 text-sm"><span aria-hidden="true">{categoryIcon(name)}</span>{name}</button>
          ))}
        </div>
      ) : null}
    </AppModal>
  );
}
