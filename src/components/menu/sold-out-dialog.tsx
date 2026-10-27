"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { AppSearchInput, AppSkeleton } from "@/components/ui/app-design-system";
import { AppModal } from "@/components/ui/app-modal";
import { MenuService } from "@/lib/data/services/menu-service";
import { useAdminApi } from "@/lib/hooks/use-admin-api";
import type { MenuItem } from "@/lib/types/domain";
import { cn } from "@/lib/utils/cn";
import { appToast } from "@/lib/utils/toast";

/** "Acabou o frango": one tap hides the item from the customers until it is back. */
export function SoldOutDialog({ restaurantId, onClose }: { restaurantId: string; onClose: () => void }): JSX.Element {
  const api = useAdminApi();
  const service = useMemo(() => new MenuService({ scope: "admin" }), []);
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    service.listItems(restaurantId)
      .then((list) => { if (alive) setItems(list.filter((item) => item.isActive).sort((a, b) => Number(a.isAvailable) - Number(b.isAvailable) || a.name.localeCompare(b.name, "pt-BR"))); })
      .catch(() => { if (alive) { setItems([]); appToast.error("Não foi possível carregar o cardápio"); } });
    return () => { alive = false; };
  }, [restaurantId, service]);

  const toggle = async (item: MenuItem) => {
    const next = !item.isAvailable;
    setBusy(item.id);
    try {
      await api("/api/admin/menu/availability", { itemId: item.id, isAvailable: next });
      setItems((current) => current?.map((entry) => (entry.id === item.id ? { ...entry, isAvailable: next } : entry)) ?? null);
      appToast.success(next ? `${item.name} voltou ao cardápio` : `${item.name} esgotado`);
    } catch (failure) {
      appToast.error("Não foi possível mudar", failure instanceof Error ? failure.message : "Tente novamente.");
    } finally {
      setBusy(null);
    }
  };

  const term = search.trim().toLowerCase();
  const visible = (items ?? []).filter((item) => !term || item.name.toLowerCase().includes(term));

  return (
    <AppModal title="Acabou alguma coisa?" onClose={onClose}>
      <p className="text-sm text-[hsl(var(--foreground-muted))]">Toque no item para marcar como esgotado. Ele some do cardápio dos clientes até você tocar de novo.</p>
      <AppSearchInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar" />
      {items === null ? <AppSkeleton className="h-40" /> : (
        <ul className="max-h-[50vh] divide-y divide-[hsl(var(--border))] overflow-y-auto rounded-[var(--radius-md)] border border-[hsl(var(--border))]">
          {visible.map((item) => (
            <li key={item.id}>
              <button type="button" disabled={busy === item.id} onClick={() => void toggle(item)} className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-[hsl(var(--surface-muted))]">
                <span className={cn("font-medium", !item.isAvailable ? "text-[hsl(var(--foreground-muted))] line-through" : "")}>{item.name}</span>
                <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", item.isAvailable ? "bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]" : "bg-[hsl(var(--danger)/0.12)] text-[hsl(var(--danger))]")}>{busy === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}{item.isAvailable ? "Tem" : "Esgotado"}</span>
              </button>
            </li>
          ))}
          {visible.length === 0 ? <li className="px-3 py-4 text-sm text-[hsl(var(--foreground-muted))]">Nada encontrado.</li> : null}
        </ul>
      )}
    </AppModal>
  );
}
