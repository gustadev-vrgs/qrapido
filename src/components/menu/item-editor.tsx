"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { Camera, ChevronDown, Loader2, Plus, Trash2, X } from "lucide-react";

import { AppActionButton, AppFormField, AppSelect, AppTextInput, AppTextarea } from "@/components/ui/app-design-system";
import { AppModal } from "@/components/ui/app-modal";
import { describeFirebaseError } from "@/lib/data/errors";
import { MenuService } from "@/lib/data/services/menu-service";
import { useAdminApi } from "@/lib/hooks/use-admin-api";
import type { MenuCategory, MenuItem, MenuOptionGroup } from "@/lib/types/domain";
import { categoryIcon } from "@/lib/utils/category-icon";
import { cn } from "@/lib/utils/cn";
import { resizeImageFile } from "@/lib/utils/image-resize";
import { MAX_OPTION_GROUPS, MAX_OPTIONS_PER_GROUP, newOptionId, WEEKDAYS } from "@/lib/utils/menu-options";
import { resolveStation } from "@/lib/utils/stations";
import { appToast } from "@/lib/utils/toast";

type Rule = "one" | "upToOne" | "many";
interface DraftOption { id: string; name: string; price: string }
interface DraftGroup { id: string; name: string; rule: Rule; options: DraftOption[] }

const RULES: Array<{ value: Rule; label: string }> = [
  { value: "one", label: "Cliente escolhe 1 (obrigatório)" },
  { value: "upToOne", label: "Cliente escolhe até 1 (opcional)" },
  { value: "many", label: "Cliente escolhe vários (opcional)" }
];

/** Ready-made groups for the usual prato feito. */
const TEMPLATES: Array<{ label: string; group: () => DraftGroup }> = [
  { label: "Acompanhamento", group: () => ({ id: newOptionId(), name: "Acompanhamento", rule: "one", options: ["Arroz e feijão", "Arroz e feijão tropeiro", "Arroz e salada"].map((name) => ({ id: newOptionId(), name, price: "0" })) }) },
  { label: "Adicionais", group: () => ({ id: newOptionId(), name: "Adicionais", rule: "many", options: [["Ovo frito", "3"], ["Bacon", "4"], ["Batata frita", "5"]].map(([name, price]) => ({ id: newOptionId(), name, price })) }) },
  { label: "Ponto da carne", group: () => ({ id: newOptionId(), name: "Ponto da carne", rule: "one", options: ["Mal passada", "Ao ponto", "Bem passada"].map((name) => ({ id: newOptionId(), name, price: "0" })) }) }
];

function ruleOf(group: MenuOptionGroup): Rule {
  if (group.min >= 1) return "one";
  return group.max <= 1 ? "upToOne" : "many";
}

/** "25,50", "1.250,00" and "25.5" all become numbers. */
export function parseMoney(value: string): number {
  const text = value.trim().replace(/^R\$\s*/i, "");
  if (!text) return Number.NaN;
  return Number(text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text);
}

const formatMoneyInput = (value: number) => (Number.isFinite(value) ? value.toFixed(2).replace(".", ",") : "");

function slugify(value: string): string {
  const slug = value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-");
  return slug.length >= 2 ? slug.slice(0, 80) : `item-${slug || Date.now().toString(36)}`;
}

export function ItemEditor({ item, categories, defaultCategoryId, nextSortOrder, restaurantId, onClose, onSaved }: {
  item: MenuItem | null;
  categories: MenuCategory[];
  defaultCategoryId?: string;
  nextSortOrder: number;
  restaurantId: string;
  onClose: () => void;
  onSaved: () => void;
}): JSX.Element {
  const api = useAdminApi();
  const service = useMemo(() => new MenuService({ scope: "admin" }), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: item?.name ?? "",
    categoryId: item?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? "",
    description: item?.description ?? "",
    price: item ? formatMoneyInput(item.price) : "",
    preparationTimeMinutes: String(item?.preparationTimeMinutes ?? 15),
    station: (item?.station ?? "auto") as "auto" | "kitchen" | "ready",
    sortOrder: String(item?.sortOrder ?? nextSortOrder),
    isActive: item?.isActive ?? true,
    isAvailable: item?.isAvailable ?? true,
    isFeatured: item?.isFeatured ?? false
  });
  const [days, setDays] = useState<number[]>(item?.availableDays ?? []);
  const [groups, setGroups] = useState<DraftGroup[]>(() => (item?.optionGroups ?? []).map((group) => ({ id: group.id, name: group.name, rule: ruleOf(group), options: group.options.map((option) => ({ id: option.id, name: option.name, price: formatMoneyInput(option.price) })) })));
  // undefined = unchanged, null = remove, string = new photo
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const preview = photo === undefined ? item?.imageUrl ?? null : photo;
  const categoryName = categories.find((category) => category.id === form.categoryId)?.name ?? "";
  const autoStation = resolveStation(null, categoryName);

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setProcessing(true);
    try {
      setPhoto(await resizeImageFile(file));
    } catch (failure) {
      appToast.error("Foto não usada", failure instanceof Error ? failure.message : "Tente outra foto.");
    } finally {
      setProcessing(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const updateGroup = (id: string, patch: Partial<DraftGroup>) => setGroups((current) => current.map((group) => (group.id === id ? { ...group, ...patch } : group)));
  const updateOption = (groupId: string, optionId: string, patch: Partial<DraftOption>) => setGroups((current) => current.map((group) => (group.id === groupId ? { ...group, options: group.options.map((option) => (option.id === optionId ? { ...option, ...patch } : option)) } : group)));

  const buildGroups = (): MenuOptionGroup[] | string => {
    const result: MenuOptionGroup[] = [];
    for (const group of groups) {
      const name = group.name.trim();
      const options = group.options.filter((option) => option.name.trim());
      if (!name && options.length === 0) continue;
      if (!name) return "Dê um nome a cada grupo de opções (ex.: Acompanhamento).";
      if (options.length === 0) return `O grupo "${name}" precisa de pelo menos uma opção.`;
      const priced = [];
      for (const option of options) {
        const price = option.price.trim() ? parseMoney(option.price) : 0;
        if (!Number.isFinite(price) || price < 0) return `Preço inválido em "${option.name.trim()}". Use 0 se já está incluso.`;
        priced.push({ id: option.id, name: option.name.trim().slice(0, 60), price: Math.round(price * 100) / 100 });
      }
      const max = group.rule === "many" ? priced.length : 1;
      result.push({ id: group.id, name: name.slice(0, 60), min: group.rule === "one" ? 1 : 0, max, options: priced });
    }
    return result;
  };

  const save = async () => {
    const nextErrors: Record<string, string> = {};
    const price = parseMoney(form.price);
    if (form.name.trim().length < 2) nextErrors.name = "Informe o nome (mínimo 2 letras).";
    if (!form.categoryId) nextErrors.categoryId = "Escolha a categoria.";
    if (!Number.isFinite(price) || price <= 0) nextErrors.price = "Informe o preço, ex.: 25,50";
    const minutes = Number(form.preparationTimeMinutes || 0);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 180) nextErrors.preparationTimeMinutes = "De 0 a 180 minutos.";
    const sortOrder = Number(form.sortOrder || 0);
    const optionGroups = buildGroups();
    if (typeof optionGroups === "string") nextErrors.groups = optionGroups;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || typeof optionGroups === "string") return;

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim().slice(0, 120),
        slug: slugify(form.name),
        categoryId: form.categoryId,
        description: form.description.trim().slice(0, 600),
        price: Math.round(price * 100) / 100,
        preparationTimeMinutes: minutes,
        // "auto" = decided by the category (drinks skip the kitchen).
        station: form.station === "auto" ? null : form.station,
        sortOrder: Number.isInteger(sortOrder) && sortOrder >= 0 ? sortOrder : 0,
        isActive: form.isActive,
        isAvailable: form.isAvailable,
        isFeatured: form.isFeatured,
        optionGroups,
        availableDays: days.length === 7 ? [] : [...days].sort()
      };
      let id = item?.id ?? null;
      if (item) await service.updateItem(item.id, payload);
      else id = await service.createItem({ restaurantId, imageUrl: null, ...payload });
      if (id && photo !== undefined) {
        try {
          await api("/api/admin/menu/image", { itemId: id, dataUrl: photo });
        } catch (failure) {
          appToast.error("Item salvo, mas a foto não", failure instanceof Error ? failure.message : "Tente enviar a foto de novo.");
        }
      }
      appToast.success(item ? "Item atualizado" : "Item criado", "Já aparece no cardápio dos clientes.");
      onSaved();
      onClose();
    } catch (failure) {
      appToast.error("Não foi possível salvar", failure instanceof Error && failure.name === "FirebaseError" ? describeFirebaseError(failure) : failure instanceof Error ? failure.message : "Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal title={item ? `Editar ${item.name}` : "Novo item"} onClose={onClose} size="lg" closeOnBackdrop={false}>
      <div className="space-y-5">
        <div className="flex gap-4">
          <button type="button" onClick={() => fileInput.current?.click()} className="relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[hsl(var(--primary-soft))]" aria-label="Escolher foto do prato">
            {preview ? <Image src={preview} alt="" fill sizes="112px" className="object-cover" unoptimized /> : <span className="text-5xl" aria-hidden="true">{categoryIcon(categoryName)}</span>}
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/55 py-1 text-xs font-semibold text-white">{processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}{preview ? "Trocar" : "Foto"}</span>
          </button>
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(event) => void pickPhoto(event.target.files?.[0])} />
          <div className="min-w-0 flex-1 space-y-3">
            <AppFormField label="Nome" error={errors.name}><AppTextInput value={form.name} maxLength={120} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex.: PF de frango grelhado" /></AppFormField>
            <div className="grid grid-cols-2 gap-3">
              <AppFormField label="Preço (R$)" error={errors.price}><AppTextInput inputMode="decimal" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} placeholder="25,50" /></AppFormField>
              <AppFormField label="Categoria" error={errors.categoryId}>
                <AppSelect value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>
                  <option value="">Escolha</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </AppSelect>
              </AppFormField>
            </div>
          </div>
        </div>
        {preview ? <button type="button" className="-mt-3 text-sm text-[hsl(var(--danger))]" onClick={() => setPhoto(null)}>Remover foto</button> : null}

        <AppFormField label="Descrição (opcional)"><AppTextarea value={form.description} maxLength={600} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Ex.: Arroz, feijão, salada e fritas" /></AppFormField>

        <section className="space-y-3">
          <div>
            <h3>Opções do prato</h3>
            <p className="text-sm text-[hsl(var(--foreground-muted))]">O que o cliente escolhe ao pedir: acompanhamento, adicionais com preço, ponto da carne.</p>
          </div>
          {groups.map((group) => (
            <div key={group.id} className="space-y-2 rounded-[var(--radius-md)] border border-[hsl(var(--border-strong))] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <AppTextInput className="min-w-0 flex-1" value={group.name} maxLength={60} onChange={(event) => updateGroup(group.id, { name: event.target.value })} placeholder="Nome do grupo, ex.: Acompanhamento" aria-label="Nome do grupo" />
                <AppSelect className="w-full sm:w-72" value={group.rule} onChange={(event) => updateGroup(group.id, { rule: event.target.value as Rule })} aria-label="Regra de escolha">
                  {RULES.map((rule) => <option key={rule.value} value={rule.value}>{rule.label}</option>)}
                </AppSelect>
                <button type="button" onClick={() => setGroups((current) => current.filter((item) => item.id !== group.id))} aria-label={`Remover grupo ${group.name}`} className="rounded-lg p-2 text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger)/0.1)]"><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="space-y-1.5">
                {group.options.map((option) => (
                  <div key={option.id} className="flex items-center gap-2">
                    <AppTextInput className="min-w-0 flex-1" value={option.name} maxLength={60} onChange={(event) => updateOption(group.id, option.id, { name: event.target.value })} placeholder="Opção, ex.: Ovo frito" aria-label="Nome da opção" />
                    <div className="relative w-28 shrink-0">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[hsl(var(--foreground-muted))]">+R$</span>
                      <AppTextInput className="pl-11" inputMode="decimal" value={option.price} onChange={(event) => updateOption(group.id, option.id, { price: event.target.value })} placeholder="0" aria-label="Preço extra" />
                    </div>
                    <button type="button" onClick={() => updateGroup(group.id, { options: group.options.filter((item) => item.id !== option.id) })} aria-label={`Remover ${option.name || "opção"}`} className="rounded-lg p-2 text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--surface-muted))]"><X className="h-4 w-4" /></button>
                  </div>
                ))}
                {group.options.length < MAX_OPTIONS_PER_GROUP ? <button type="button" onClick={() => updateGroup(group.id, { options: [...group.options, { id: newOptionId(), name: "", price: "0" }] })} className="inline-flex items-center gap-1 text-sm font-medium text-[hsl(var(--primary))]"><Plus className="h-4 w-4" />Opção</button> : null}
              </div>
            </div>
          ))}
          {errors.groups ? <p className="text-sm text-[hsl(var(--danger))]">{errors.groups}</p> : null}
          {groups.length < MAX_OPTION_GROUPS ? (
            <div className="flex flex-wrap gap-2">
              <AppActionButton variant="secondary" className="h-9 gap-1.5" onClick={() => setGroups((current) => [...current, { id: newOptionId(), name: "", rule: "one", options: [{ id: newOptionId(), name: "", price: "0" }] }])}><Plus className="h-4 w-4" />Grupo de opções</AppActionButton>
              {TEMPLATES.filter((template) => !groups.some((group) => group.name.trim().toLowerCase() === template.label.toLowerCase())).map((template) => (
                <AppActionButton key={template.label} variant="ghost" className="h-9 gap-1.5 border border-dashed border-[hsl(var(--border-strong))]" onClick={() => setGroups((current) => [...current, template.group()])}><Plus className="h-4 w-4" />{template.label}</AppActionButton>
              ))}
            </div>
          ) : null}
        </section>

        <section className="space-y-2">
          <div>
            <h3>Dias em que é servido</h3>
            <p className="text-sm text-[hsl(var(--foreground-muted))]">Para o prato do dia (ex.: feijoada na quarta e no sábado). Nenhum marcado = todos os dias.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => {
              const active = days.includes(day.value);
              return <button key={day.value} type="button" aria-pressed={active} onClick={() => setDays((current) => (active ? current.filter((value) => value !== day.value) : [...current, day.value]))} className={cn("h-10 min-w-12 rounded-[var(--radius-md)] border px-3 text-sm font-semibold", active ? "border-[hsl(var(--gema))] bg-[hsl(var(--gema)/0.22)]" : "border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))]")}>{day.short}</button>;
            })}
          </div>
        </section>

        <section className="space-y-3">
          <button type="button" className="flex w-full items-center justify-between text-left" aria-expanded={showAdvanced} onClick={() => setShowAdvanced((value) => !value)}>
            <h3>Mais ajustes</h3><ChevronDown className={cn("h-5 w-5 transition-transform", showAdvanced ? "rotate-180" : "")} />
          </button>
          {showAdvanced ? (
            <div className="space-y-3">
              <AppFormField label="Onde é preparado" hint={`Pronta entrega não passa pela cozinha: vai direto para o garçom. Automático agora: ${autoStation === "ready" ? "pronta entrega" : "cozinha"}.`}>
                <AppSelect value={form.station} onChange={(event) => setForm({ ...form, station: event.target.value as typeof form.station })}>
                  <option value="auto">Automático pela categoria</option>
                  <option value="kitchen">Cozinha (precisa de preparo)</option>
                  <option value="ready">Pronta entrega (bebidas, itens prontos)</option>
                </AppSelect>
              </AppFormField>
              <div className="grid grid-cols-2 gap-3">
                <AppFormField label="Preparo (min)" error={errors.preparationTimeMinutes}><AppTextInput type="number" min={0} max={180} value={form.preparationTimeMinutes} onChange={(event) => setForm({ ...form, preparationTimeMinutes: event.target.value })} /></AppFormField>
                <AppFormField label="Ordem no cardápio"><AppTextInput type="number" min={0} value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} /></AppFormField>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" checked={form.isFeatured} onChange={(event) => setForm({ ...form, isFeatured: event.target.checked })} />Destaque no topo do cardápio</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={!form.isActive} onChange={(event) => setForm({ ...form, isActive: !event.target.checked })} />Esconder do cardápio</label>
              </div>
            </div>
          ) : null}
        </section>

        <div className="flex justify-end gap-2 border-t border-[hsl(var(--border))] pt-4">
          <AppActionButton variant="secondary" onClick={onClose}>Cancelar</AppActionButton>
          <AppActionButton className="min-w-32" disabled={saving || processing || categories.length === 0} onClick={() => void save()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{item ? "Salvar" : "Criar item"}</AppActionButton>
        </div>
      </div>
    </AppModal>
  );
}
