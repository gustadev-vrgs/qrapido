"use client";

import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus, Loader2, PackageSearch, PencilLine, Plus, Sparkles, Tag } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  AppActionButton,
  AppDataCard,
  AppEmptyState,
  AppFilterBar,
  AppFormField,
  AppSearchInput,
  AppSectionCard,
  AppSelect,
  AppStatusBadge,
  AppTextInput,
  AppTextarea
} from "@/components/ui/app-design-system";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import { MenuService } from "@/lib/data/services/menu-service";
import type { MenuCategory, MenuItem } from "@/lib/types/domain";
import { appToast } from "@/lib/utils/toast";
import { formatCurrency } from "@/lib/utils/formatters";

const categoryFormSchema = z.object({
  name: z.string().min(2, "Informe um nome com pelo menos 2 caracteres."),
  description: z.string().min(5, "Descreva melhor esta categoria.").max(400, "Máximo de 400 caracteres."),
  sortOrder: z.coerce.number().int().min(0, "A ordem não pode ser negativa."),
  isActive: z.boolean()
});

const itemFormSchema = z.object({
  name: z.string().min(2, "Informe um nome com pelo menos 2 caracteres."),
  categoryId: z.string().min(1, "Selecione uma categoria."),
  description: z.string().min(8, "A descrição deve ter ao menos 8 caracteres.").max(600, "Máximo de 600 caracteres."),
  price: z.coerce.number().positive("O preço deve ser maior que zero."),
  preparationTimeMinutes: z.coerce.number().int().min(1, "Informe no mínimo 1 minuto.").max(180, "Máximo de 180 minutos."),
  imageUrl: z
    .string()
    .trim()
    .refine((value) => !value || /^https?:\/\//.test(value), "Use uma URL válida iniciando com http:// ou https://")
    .optional(),
  sortOrder: z.coerce.number().int().min(0, "A ordem não pode ser negativa."),
  isActive: z.boolean(),
  isAvailable: z.boolean(),
  isFeatured: z.boolean()
});

type CategoryFormValues = z.infer<typeof categoryFormSchema>;
type ItemFormValues = z.infer<typeof itemFormSchema>;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

const statusFilterOptions = [
  { label: "Todos os status", value: "all" },
  { label: "Ativos", value: "active" },
  { label: "Inativos", value: "inactive" },
  { label: "Disponíveis", value: "available" },
  { label: "Indisponíveis", value: "unavailable" },
  { label: "Em destaque", value: "featured" }
] as const;

type ItemStatusFilter = (typeof statusFilterOptions)[number]["value"];

export default function CardapioPage(): JSX.Element {
  const { user } = useAdminAuth();
  const menuService = useMemo(() => new MenuService({ scope: "admin" }), []);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<ItemStatusFilter>("all");

  const [selectedCategory, setSelectedCategory] = useState<MenuCategory | null>(null);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);

  const categoryForm = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: { name: "", description: "", sortOrder: 0, isActive: true }
  });

  const itemForm = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: {
      name: "",
      categoryId: "",
      description: "",
      price: 0,
      preparationTimeMinutes: 20,
      imageUrl: "",
      sortOrder: 0,
      isActive: true,
      isAvailable: true,
      isFeatured: false
    }
  });

  const loadData = async (refresh = false) => {
    if (!user?.restaurantId) return;

    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const [fetchedCategories, fetchedItems] = await Promise.all([
        menuService.listCategories(user.restaurantId),
        menuService.listItems(user.restaurantId)
      ]);

      setCategories(fetchedCategories);
      setItems(fetchedItems);
    } catch (error) {
      console.error(error);
      appToast.error("Não foi possível carregar o cardápio", "Verifique sua conexão e permissões administrativas.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.restaurantId]);

  useEffect(() => {
    if (selectedCategory) {
      categoryForm.reset({
        name: selectedCategory.name,
        description: selectedCategory.description,
        sortOrder: selectedCategory.sortOrder,
        isActive: selectedCategory.isActive
      });
    } else {
      categoryForm.reset({ name: "", description: "", sortOrder: categories.length, isActive: true });
    }
  }, [selectedCategory, categoryForm, categories.length]);

  useEffect(() => {
    if (selectedItem) {
      itemForm.reset({
        name: selectedItem.name,
        categoryId: selectedItem.categoryId,
        description: selectedItem.description,
        price: selectedItem.price,
        preparationTimeMinutes: selectedItem.preparationTimeMinutes,
        imageUrl: selectedItem.imageUrl ?? "",
        sortOrder: selectedItem.sortOrder,
        isActive: selectedItem.isActive,
        isAvailable: selectedItem.isAvailable,
        isFeatured: selectedItem.isFeatured
      });
    } else {
      itemForm.reset({
        name: "",
        categoryId: categories[0]?.id ?? "",
        description: "",
        price: 0,
        preparationTimeMinutes: 20,
        imageUrl: "",
        sortOrder: items.length,
        isActive: true,
        isAvailable: true,
        isFeatured: false
      });
    }
  }, [selectedItem, itemForm, categories, items.length]);

  const categoryNameById = useMemo(
    () => categories.reduce<Record<string, string>>((acc, category) => ({ ...acc, [category.id]: category.name }), {}),
    [categories]
  );

  const filteredItems = useMemo(() => {
    const normalized = search.trim().toLowerCase();

    return items.filter((item) => {
      if (categoryFilter !== "all" && item.categoryId !== categoryFilter) return false;

      if (statusFilter === "active" && !item.isActive) return false;
      if (statusFilter === "inactive" && item.isActive) return false;
      if (statusFilter === "available" && !item.isAvailable) return false;
      if (statusFilter === "unavailable" && item.isAvailable) return false;
      if (statusFilter === "featured" && !item.isFeatured) return false;

      if (!normalized) return true;

      const categoryName = categoryNameById[item.categoryId] ?? "";
      return `${item.name} ${item.description} ${categoryName}`.toLowerCase().includes(normalized);
    });
  }, [items, categoryFilter, statusFilter, search, categoryNameById]);

  const summary = useMemo(() => {
    const availableItems = items.filter((item) => item.isAvailable).length;
    const featuredItems = items.filter((item) => item.isFeatured).length;

    return {
      categories: categories.length,
      items: items.length,
      availableItems,
      featuredItems
    };
  }, [categories.length, items]);

  const handleCategorySubmit = categoryForm.handleSubmit(async (values) => {
    if (!user?.restaurantId) return;

    try {
      if (selectedCategory) {
        await menuService.updateCategory(selectedCategory.id, { ...values, slug: slugify(values.name) });
        appToast.success("Categoria atualizada", "As mudanças já estão disponíveis no cardápio.");
      } else {
        await menuService.createCategory({
          restaurantId: user.restaurantId,
          ...values,
          slug: slugify(values.name)
        });
        appToast.success("Categoria criada", "Nova seção adicionada ao cardápio.");
      }

      setSelectedCategory(null);
      await loadData(true);
    } catch (error) {
      console.error(error);
      appToast.error("Erro ao salvar categoria", "Revise os dados e tente novamente.");
    }
  });

  const handleItemSubmit = itemForm.handleSubmit(async (values) => {
    if (!user?.restaurantId) return;

    try {
      const payload = {
        ...values,
        imageUrl: values.imageUrl?.trim() ? values.imageUrl.trim() : null,
        slug: slugify(values.name)
      };

      if (selectedItem) {
        await menuService.updateItem(selectedItem.id, payload);
        appToast.success("Item atualizado", "As alterações foram aplicadas com sucesso.");
      } else {
        await menuService.createItem({
          restaurantId: user.restaurantId,
          ...payload
        });
        appToast.success("Item criado", "Item adicionado ao cardápio com sucesso.");
      }

      setSelectedItem(null);
      await loadData(true);
    } catch (error) {
      console.error(error);
      appToast.error("Erro ao salvar item", "Revise os campos obrigatórios e tente novamente.");
    }
  });

  const patchItem = async (item: MenuItem, partial: Partial<MenuItem>) => {
    try {
      await menuService.updateItem(item.id, partial);
      await loadData(true);
    } catch (error) {
      console.error(error);
      appToast.error("Não foi possível atualizar o item", "Tente novamente em alguns instantes.");
    }
  };

  const patchCategory = async (category: MenuCategory, partial: Partial<MenuCategory>) => {
    try {
      await menuService.updateCategory(category.id, partial);
      await loadData(true);
    } catch (error) {
      console.error(error);
      appToast.error("Não foi possível atualizar a categoria", "Tente novamente em alguns instantes.");
    }
  };

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <AppDataCard title={String(summary.categories)} metadata="Categorias estruturadas" status={<Tag className="h-4 w-4 text-[hsl(var(--foreground-muted))]" />}>
          <p className="text-xs text-[hsl(var(--foreground-muted))]">Gestão por seção para manter o cardápio organizado.</p>
        </AppDataCard>
        <AppDataCard title={String(summary.items)} metadata="Itens totais" status={<PackageSearch className="h-4 w-4 text-[hsl(var(--foreground-muted))]" />}>
          <p className="text-xs text-[hsl(var(--foreground-muted))]">Produtos cadastrados no painel administrativo.</p>
        </AppDataCard>
        <AppDataCard title={String(summary.availableItems)} metadata="Disponíveis agora" status={<AppStatusBadge tone="success">Disponível</AppStatusBadge>}>
          <p className="text-xs text-[hsl(var(--foreground-muted))]">Controle rápido para itens fora de operação.</p>
        </AppDataCard>
        <AppDataCard title={String(summary.featuredItems)} metadata="Itens em destaque" status={<Sparkles className="h-4 w-4 text-[hsl(var(--warning))]" />}>
          <p className="text-xs text-[hsl(var(--foreground-muted))]">Destaques do cardápio para aumentar conversão.</p>
        </AppDataCard>
      </div>

      <AppFilterBar>
        <AppSearchInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, descrição ou categoria" className="w-full md:max-w-md" />
        <AppSelect className="md:w-56" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="all">Todas as categorias</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </AppSelect>
        <AppSelect className="md:w-56" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ItemStatusFilter)}>
          {statusFilterOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </AppSelect>
        <AppActionButton variant="secondary" className="md:ml-auto" onClick={() => void loadData(true)}>
          {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Atualizar
        </AppActionButton>
      </AppFilterBar>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1.5fr]">
        <AppSectionCard
          title="Categorias"
          description="Organize o cardápio por seções com ordem visual e status de ativação."
          action={
            <AppActionButton variant="secondary" onClick={() => setSelectedCategory(null)}>
              <Plus className="mr-2 h-4 w-4" />
              Nova categoria
            </AppActionButton>
          }
        >
          <div className="space-y-3">
            {!isLoading && categories.length === 0 ? (
              <AppEmptyState
                title="Seu cardápio ainda não tem categorias"
                description="Crie a primeira categoria para começar a estruturar pratos, bebidas e combos com uma apresentação profissional."
              />
            ) : (
              categories.map((category, index) => (
                <article key={category.id} className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-semibold">{category.name}</h3>
                    <div className="flex items-center gap-2">
                      <AppStatusBadge tone={category.isActive ? "success" : "neutral"}>{category.isActive ? "Ativa" : "Inativa"}</AppStatusBadge>
                      <AppActionButton variant="ghost" className="h-8 px-3" onClick={() => setSelectedCategory(category)}>
                        <PencilLine className="mr-1.5 h-3.5 w-3.5" />
                        Editar
                      </AppActionButton>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-[hsl(var(--foreground-muted))]">{category.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <AppActionButton variant="secondary" className="h-8 px-3 text-xs" onClick={() => void patchCategory(category, { isActive: !category.isActive })}>
                      {category.isActive ? "Desativar" : "Ativar"}
                    </AppActionButton>
                    <AppActionButton
                      variant="ghost"
                      className="h-8 px-3 text-xs"
                      disabled={index === 0}
                      onClick={() => void patchCategory(category, { sortOrder: Math.max(0, category.sortOrder - 1) })}
                    >
                      Subir ordem
                    </AppActionButton>
                  </div>
                </article>
              ))
            )}
          </div>

          <form onSubmit={(event) => void handleCategorySubmit(event)} className="mt-5 space-y-3 rounded-2xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))] p-4">
            <h3 className="text-base font-semibold">{selectedCategory ? "Editar categoria" : "Criar categoria"}</h3>
            <AppFormField label="Nome" error={categoryForm.formState.errors.name?.message}>
              <AppTextInput placeholder="Ex.: Pratos principais" {...categoryForm.register("name")} />
            </AppFormField>
            <AppFormField label="Descrição" error={categoryForm.formState.errors.description?.message}>
              <AppTextarea placeholder="Explique rapidamente os itens desta seção." {...categoryForm.register("description")} />
            </AppFormField>
            <div className="grid gap-3 md:grid-cols-2">
              <AppFormField label="Ordem visual" error={categoryForm.formState.errors.sortOrder?.message}>
                <AppTextInput type="number" min={0} {...categoryForm.register("sortOrder")} />
              </AppFormField>
              <AppFormField label="Status operacional">
                <AppSelect value={categoryForm.watch("isActive") ? "active" : "inactive"} onChange={(event) => categoryForm.setValue("isActive", event.target.value === "active")}>
                  <option value="active">Ativa</option>
                  <option value="inactive">Inativa</option>
                </AppSelect>
              </AppFormField>
            </div>
            <div className="flex gap-2">
              <AppActionButton type="submit" disabled={categoryForm.formState.isSubmitting}>
                {categoryForm.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {selectedCategory ? "Salvar categoria" : "Criar categoria"}
              </AppActionButton>
              {selectedCategory ? (
                <AppActionButton variant="ghost" onClick={() => setSelectedCategory(null)}>
                  Cancelar edição
                </AppActionButton>
              ) : null}
            </div>
          </form>
        </AppSectionCard>

        <AppSectionCard
          title="Itens do cardápio"
          description="Cadastro completo com disponibilidade, destaque, imagem e tempo de preparo."
          action={
            <AppActionButton onClick={() => setSelectedItem(null)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo item
            </AppActionButton>
          }
        >
          {!isLoading && filteredItems.length === 0 ? (
            <AppEmptyState
              title="Nenhum item encontrado para os filtros atuais"
              description="Ajuste os filtros ou crie um novo item para preencher esta seção do cardápio."
              action={
                <AppActionButton onClick={() => setSelectedItem(null)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Criar item agora
                </AppActionButton>
              }
            />
          ) : (
            <div className="space-y-3">
              {filteredItems.map((item) => (
                <article key={item.id} className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start">
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]">
                      {item.imageUrl ? (
                        <div className="h-full w-full bg-cover bg-center" role="img" aria-label={item.name} style={{ backgroundImage: `url(${item.imageUrl})` }} />
                      ) : (
                        <ImagePlus className="h-5 w-5 text-[hsl(var(--foreground-muted))]" />
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-base font-semibold">{item.name}</h3>
                        <AppActionButton variant="ghost" className="h-8 px-3" onClick={() => setSelectedItem(item)}>
                          <PencilLine className="mr-1.5 h-3.5 w-3.5" />
                          Editar
                        </AppActionButton>
                      </div>
                      <p className="text-xs uppercase tracking-[0.12em] text-[hsl(var(--foreground-muted))]">{categoryNameById[item.categoryId] ?? "Categoria removida"}</p>
                      <p className="text-sm text-[hsl(var(--foreground-muted))]">{item.description}</p>
                      <div className="flex flex-wrap gap-2">
                        <AppStatusBadge tone={item.isActive ? "success" : "neutral"}>{item.isActive ? "Ativo" : "Inativo"}</AppStatusBadge>
                        <AppStatusBadge tone={item.isAvailable ? "info" : "warning"}>{item.isAvailable ? "Disponível" : "Indisponível"}</AppStatusBadge>
                        <AppStatusBadge tone={item.isFeatured ? "warning" : "neutral"}>{item.isFeatured ? "Destaque" : "Comum"}</AppStatusBadge>
                        <AppStatusBadge tone="neutral">{item.preparationTimeMinutes} min</AppStatusBadge>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <p className="text-base font-semibold">{formatCurrency(item.price)}</p>
                        <div className="flex flex-wrap gap-2">
                          <AppActionButton variant="secondary" className="h-8 px-3 text-xs" onClick={() => void patchItem(item, { isActive: !item.isActive })}>
                            {item.isActive ? "Desativar" : "Ativar"}
                          </AppActionButton>
                          <AppActionButton variant="secondary" className="h-8 px-3 text-xs" onClick={() => void patchItem(item, { isAvailable: !item.isAvailable })}>
                            {item.isAvailable ? "Marcar indisponível" : "Marcar disponível"}
                          </AppActionButton>
                          <AppActionButton variant="secondary" className="h-8 px-3 text-xs" onClick={() => void patchItem(item, { isFeatured: !item.isFeatured })}>
                            {item.isFeatured ? "Remover destaque" : "Destacar"}
                          </AppActionButton>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          <form onSubmit={(event) => void handleItemSubmit(event)} className="mt-5 space-y-3 rounded-2xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))] p-4">
            <h3 className="text-base font-semibold">{selectedItem ? "Editar item" : "Criar item"}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <AppFormField label="Nome" error={itemForm.formState.errors.name?.message}>
                <AppTextInput placeholder="Ex.: Filé à parmegiana" {...itemForm.register("name")} />
              </AppFormField>
              <AppFormField label="Categoria" error={itemForm.formState.errors.categoryId?.message}>
                <AppSelect {...itemForm.register("categoryId")}>
                  <option value="">Selecione uma categoria</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </AppSelect>
              </AppFormField>
            </div>
            <AppFormField label="Descrição" error={itemForm.formState.errors.description?.message}>
              <AppTextarea placeholder="Detalhes que ajudam o cliente na decisão de compra." {...itemForm.register("description")} />
            </AppFormField>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <AppFormField label="Preço (R$)" error={itemForm.formState.errors.price?.message}>
                <AppTextInput type="number" min={0} step="0.01" {...itemForm.register("price")} />
              </AppFormField>
              <AppFormField label="Preparo (min)" error={itemForm.formState.errors.preparationTimeMinutes?.message}>
                <AppTextInput type="number" min={1} max={180} {...itemForm.register("preparationTimeMinutes")} />
              </AppFormField>
              <AppFormField label="Ordem visual" error={itemForm.formState.errors.sortOrder?.message}>
                <AppTextInput type="number" min={0} {...itemForm.register("sortOrder")} />
              </AppFormField>
              <AppFormField label="Destaque">
                <AppSelect value={itemForm.watch("isFeatured") ? "yes" : "no"} onChange={(event) => itemForm.setValue("isFeatured", event.target.value === "yes")}>
                  <option value="no">Não</option>
                  <option value="yes">Sim</option>
                </AppSelect>
              </AppFormField>
            </div>
            <AppFormField
              label="Imagem (URL)"
              hint="Upload real pode ser conectado depois; por enquanto, aceite URL externa ou deixe em branco para fallback elegante."
              error={itemForm.formState.errors.imageUrl?.message}
            >
              <AppTextInput placeholder="https://..." {...itemForm.register("imageUrl")} />
            </AppFormField>
            <div className="grid gap-3 md:grid-cols-2">
              <AppFormField label="Status ativo">
                <AppSelect value={itemForm.watch("isActive") ? "active" : "inactive"} onChange={(event) => itemForm.setValue("isActive", event.target.value === "active")}>
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </AppSelect>
              </AppFormField>
              <AppFormField label="Disponibilidade">
                <AppSelect value={itemForm.watch("isAvailable") ? "available" : "unavailable"} onChange={(event) => itemForm.setValue("isAvailable", event.target.value === "available")}>
                  <option value="available">Disponível</option>
                  <option value="unavailable">Indisponível</option>
                </AppSelect>
              </AppFormField>
            </div>
            <div className="flex gap-2">
              <AppActionButton type="submit" disabled={itemForm.formState.isSubmitting || categories.length === 0}>
                {itemForm.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {selectedItem ? "Salvar item" : "Criar item"}
              </AppActionButton>
              {selectedItem ? (
                <AppActionButton variant="ghost" onClick={() => setSelectedItem(null)}>
                  Cancelar edição
                </AppActionButton>
              ) : null}
            </div>
          </form>
        </AppSectionCard>
      </div>
    </section>
  );
}
