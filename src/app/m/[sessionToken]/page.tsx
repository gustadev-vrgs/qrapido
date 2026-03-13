"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Clock3,
  Lock,
  MenuSquare,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  X
} from "lucide-react";

import { AppActionButton, AppDataCard, AppSearchInput, AppSkeleton, AppStatusBadge, AppSurface, MobileStickyBar } from "@/components/ui/app-design-system";
import { MenuService, RestaurantsService, SessionsService } from "@/lib/data";
import type { MenuCategory, MenuItem, TableSession } from "@/lib/types/domain";
import { formatCurrency } from "@/lib/utils/formatters";

interface MobileSessionPageProps {
  params: {
    sessionToken: string;
  };
}

type MobileSessionState = "loading" | "valid" | "invalid" | "expired" | "blocked" | "error";

interface SessionViewModel {
  restaurantId: string;
  restaurantName: string;
  tableNumber: number;
  customerName: string | null;
  sessionLabel: string;
  status: TableSession["status"];
  expiresAtLabel: string;
}

interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
  imageUrl: string | null;
}

const SESSION_TOKEN_PATTERN = /^[a-zA-Z0-9_-]{16,128}$/;

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function mapSessionState(session: TableSession): MobileSessionState {
  if (session.status === "blocked") {
    return "blocked";
  }

  if (session.status === "expired" || new Date(session.expiresAt).getTime() < Date.now()) {
    return "expired";
  }

  if (session.status === "active" || session.status === "idle") {
    return "valid";
  }

  return "invalid";
}

function SessionMessageCard({
  icon,
  title,
  description,
  accent = "neutral"
}: {
  icon: JSX.Element;
  title: string;
  description: string;
  accent?: "neutral" | "warning" | "danger";
}): JSX.Element {
  const accentClass = {
    neutral: "border-[hsl(var(--border-strong))]",
    warning: "border-[hsl(var(--warning)/0.5)]",
    danger: "border-[hsl(var(--danger)/0.5)]"
  }[accent];

  return (
    <AppSurface className={`p-6 ${accentClass}`}>
      <div className="flex items-start gap-4">
        <div className="rounded-2xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))] p-3">{icon}</div>
        <div className="space-y-2">
          <h2 className="text-lg">{title}</h2>
          <p className="text-sm leading-relaxed text-[hsl(var(--foreground-muted))]">{description}</p>
        </div>
      </div>
    </AppSurface>
  );
}

function ItemImage({ imageUrl, alt }: { imageUrl: string | null; alt: string }): JSX.Element {
  if (imageUrl) {
    return <img src={imageUrl} alt={alt} className="h-full w-full object-cover" loading="lazy" />;
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_20%_20%,_hsl(var(--primary)/0.28),_hsl(var(--surface-muted)))] text-xs text-[hsl(var(--foreground-muted))]">
      Sem imagem
    </div>
  );
}

export default function MobileSessionPage({ params }: MobileSessionPageProps): JSX.Element {
  const [state, setState] = useState<MobileSessionState>("loading");
  const [session, setSession] = useState<SessionViewModel | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string>("all");
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [detailQuantity, setDetailQuantity] = useState(1);
  const [detailNotes, setDetailNotes] = useState("");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [preparedMessage, setPreparedMessage] = useState<string | null>(null);

  const normalizedToken = useMemo(() => decodeURIComponent(params.sessionToken ?? "").trim(), [params.sessionToken]);

  useEffect(() => {
    let active = true;

    async function loadSession(): Promise<void> {
      setState("loading");

      if (!SESSION_TOKEN_PATTERN.test(normalizedToken)) {
        if (active) {
          setSession(null);
          setState("invalid");
        }
        return;
      }

      try {
        const sessionsService = new SessionsService();
        const restaurantsService = new RestaurantsService();

        const currentSession = await sessionsService.getByTokenGlobal(normalizedToken);

        if (!active) {
          return;
        }

        if (!currentSession) {
          setSession(null);
          setState("invalid");
          return;
        }

        const restaurant = await restaurantsService.getById(currentSession.restaurantId);

        if (!active) {
          return;
        }

        const nextState = mapSessionState(currentSession);

        setSession({
          restaurantId: currentSession.restaurantId,
          restaurantName: restaurant.name,
          tableNumber: currentSession.tableNumber,
          customerName: currentSession.customerName,
          sessionLabel: currentSession.sessionLabel,
          status: currentSession.status,
          expiresAtLabel: formatDateTime(currentSession.expiresAt)
        });
        setState(nextState);
      } catch {
        if (active) {
          setSession(null);
          setState("error");
        }
      }
    }

    loadSession();

    return () => {
      active = false;
    };
  }, [normalizedToken]);

  useEffect(() => {
    if (!session || state !== "valid") {
      return;
    }

    const restaurantId = session.restaurantId;
    let active = true;

    async function loadMenu(): Promise<void> {
      setMenuLoading(true);
      setMenuError(null);
      try {
        const menuService = new MenuService();
        const [categoriesResponse, itemsResponse] = await Promise.all([menuService.listCategories(restaurantId), menuService.listItems(restaurantId)]);

        if (!active) {
          return;
        }

        const activeCategories = categoriesResponse.filter((category) => category.isActive);
        const activeItems = itemsResponse.filter((item) => item.isActive);

        setCategories(activeCategories);
        setItems(activeItems);
        setActiveCategoryId(activeCategories[0]?.id ?? "all");
      } catch {
        if (active) {
          setMenuError("Não foi possível carregar o cardápio agora.");
        }
      } finally {
        if (active) {
          setMenuLoading(false);
        }
      }
    }

    loadMenu();

    return () => {
      active = false;
    };
  }, [session, state]);

  useEffect(() => {
    if (!SESSION_TOKEN_PATTERN.test(normalizedToken) || state !== "valid") {
      return;
    }

    const storageKey = `qrapido-cart-${normalizedToken}`;
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as CartItem[];
      if (Array.isArray(parsed)) {
        setCartItems(parsed);
      }
    } catch {
      window.sessionStorage.removeItem(storageKey);
    }
  }, [normalizedToken, state]);

  useEffect(() => {
    if (!SESSION_TOKEN_PATTERN.test(normalizedToken) || state !== "valid") {
      return;
    }

    const storageKey = `qrapido-cart-${normalizedToken}`;
    window.sessionStorage.setItem(storageKey, JSON.stringify(cartItems));
  }, [cartItems, normalizedToken, state]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return items.filter((item) => {
      const categoryMatches = activeCategoryId === "all" || item.categoryId === activeCategoryId;
      const searchMatches =
        normalizedSearch.length === 0 || item.name.toLowerCase().includes(normalizedSearch) || item.description.toLowerCase().includes(normalizedSearch);

      return categoryMatches && searchMatches;
    });
  }, [activeCategoryId, items, searchTerm]);

  const cartCount = useMemo(() => cartItems.reduce((total, item) => total + item.quantity, 0), [cartItems]);
  const subtotal = useMemo(() => cartItems.reduce((total, item) => total + item.quantity * item.price, 0), [cartItems]);

  function openItemDetail(item: MenuItem): void {
    setSelectedItem(item);
    setDetailQuantity(1);
    setDetailNotes("");
  }

  function addToCart(): void {
    if (!selectedItem || !selectedItem.isAvailable) {
      return;
    }

    setPreparedMessage(null);
    setCartItems((currentItems) => {
      const existing = currentItems.find((item) => item.menuItemId === selectedItem.id && item.notes === detailNotes.trim());

      if (existing) {
        return currentItems.map((item) =>
          item.menuItemId === selectedItem.id && item.notes === detailNotes.trim() ? { ...item, quantity: item.quantity + detailQuantity } : item
        );
      }

      return [
        ...currentItems,
        {
          menuItemId: selectedItem.id,
          name: selectedItem.name,
          price: selectedItem.price,
          quantity: detailQuantity,
          notes: detailNotes.trim(),
          imageUrl: selectedItem.imageUrl
        }
      ];
    });

    setSelectedItem(null);
    setDetailQuantity(1);
    setDetailNotes("");
    setCartOpen(true);
  }

  function changeCartQuantity(itemKey: string, delta: number): void {
    setPreparedMessage(null);
    setCartItems((currentItems) =>
      currentItems
        .map((item) => (itemKey === `${item.menuItemId}::${item.notes}` ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item))
        .filter((item) => item.quantity > 0)
    );
  }

  function removeFromCart(itemKey: string): void {
    setPreparedMessage(null);
    setCartItems((currentItems) => currentItems.filter((item) => `${item.menuItemId}::${item.notes}` !== itemKey));
  }

  function prepareOrder(): void {
    if (!session || cartItems.length === 0) {
      return;
    }

    const payload = {
      sessionToken: normalizedToken,
      sessionLabel: session.sessionLabel,
      tableNumber: session.tableNumber,
      items: cartItems.map((item) => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        notes: item.notes || null
      })),
      subtotal,
      total: subtotal
    };

    setPreparedMessage(`Pedido pronto para envio com ${payload.items.length} itens.`);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_hsl(var(--surface-muted)),_hsl(var(--background))_58%)] px-4 pb-32 pt-5 text-[hsl(var(--foreground))]">
      <section className="mx-auto flex w-full max-w-md flex-col gap-4">
        <AppSurface variant="strong" className="overflow-hidden p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--foreground-muted))]">
              <Sparkles className="h-3.5 w-3.5" /> QRápido
            </div>
            {state === "valid" ? <AppStatusBadge tone="success">Sessão ativa</AppStatusBadge> : null}
          </div>
          <h1 className="text-2xl leading-tight">Seu pedido começa aqui</h1>
          <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--foreground-muted))]">
            Cardápio inteligente, navegação rápida e carrinho elegante para você montar o pedido completo sem sair da mesa.
          </p>
        </AppSurface>

        {state === "loading" ? (
          <>
            <AppSkeleton className="h-32 w-full" />
            <AppSkeleton className="h-28 w-full" />
            <AppSkeleton className="h-24 w-full" />
          </>
        ) : null}

        {state === "valid" && session ? (
          <>
            <AppDataCard
              title={session.restaurantName}
              metadata={`Mesa ${session.tableNumber} • Expira em ${session.expiresAtLabel}`}
              status={<AppStatusBadge tone="info">{session.status}</AppStatusBadge>}
            >
              <p className="text-sm text-[hsl(var(--foreground-muted))]">{session.customerName ? `Sessão de ${session.customerName}` : "Sessão sem identificação de nome."}</p>
            </AppDataCard>

            <AppSurface className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg">Navegar no cardápio</h2>
                <div className="rounded-full border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))] px-3 py-1 text-xs text-[hsl(var(--foreground-muted))]">
                  {items.length} itens
                </div>
              </div>

              <AppSearchInput value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar pratos, bebidas e sobremesas" />

              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                <AppActionButton
                  variant={activeCategoryId === "all" ? "primary" : "secondary"}
                  className="h-9 shrink-0 rounded-full px-4"
                  onClick={() => setActiveCategoryId("all")}
                >
                  Todos
                </AppActionButton>
                {categories.map((category) => (
                  <AppActionButton
                    key={category.id}
                    variant={activeCategoryId === category.id ? "primary" : "secondary"}
                    className="h-9 shrink-0 rounded-full px-4"
                    onClick={() => setActiveCategoryId(category.id)}
                  >
                    {category.name}
                  </AppActionButton>
                ))}
              </div>
            </AppSurface>

            {menuLoading ? (
              <div className="space-y-3">
                <AppSkeleton className="h-40 w-full" />
                <AppSkeleton className="h-40 w-full" />
              </div>
            ) : null}

            {menuError ? (
              <AppSurface className="p-5 text-sm text-[hsl(var(--danger))]">
                <p>{menuError}</p>
              </AppSurface>
            ) : null}

            {!menuLoading && !menuError && filteredItems.length === 0 ? (
              <AppSurface className="space-y-2 p-5 text-center">
                <Search className="mx-auto h-5 w-5 text-[hsl(var(--foreground-muted))]" />
                <p className="text-sm">Nenhum item encontrado com os filtros atuais.</p>
              </AppSurface>
            ) : null}

            {!menuLoading && !menuError ? (
              <div className="space-y-3">
                {filteredItems.map((item) => (
                  <AppSurface key={item.id} className="overflow-hidden p-0">
                    <button className="w-full text-left" onClick={() => openItemDetail(item)}>
                      <div className="flex gap-3 p-3">
                        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-[hsl(var(--border-strong))]">
                          <ItemImage imageUrl={item.imageUrl} alt={item.name} />
                          {!item.isAvailable ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-[hsl(var(--background)/0.72)] text-[11px] font-semibold uppercase tracking-[0.1em] text-[hsl(var(--danger))]">
                              Indisponível
                            </div>
                          ) : null}
                        </div>
                        <div className="flex flex-1 flex-col gap-2">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-base leading-tight">{item.name}</h3>
                            {item.isFeatured ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.14)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--warning))]">
                                <Sparkles className="h-3 w-3" /> Destaque
                              </span>
                            ) : null}
                          </div>
                          <p className="line-clamp-2 text-xs text-[hsl(var(--foreground-muted))]">{item.description}</p>
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold">{formatCurrency(item.price)}</p>
                            {item.preparationTimeMinutes > 0 ? (
                              <span className="inline-flex items-center gap-1 text-xs text-[hsl(var(--foreground-muted))]">
                                <Clock3 className="h-3.5 w-3.5" /> {item.preparationTimeMinutes} min
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </button>
                  </AppSurface>
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        {state === "invalid" ? (
          <SessionMessageCard
            icon={<AlertTriangle className="h-5 w-5 text-[hsl(var(--warning))]" />}
            title="Sessão não encontrada"
            description="Este QR pode estar desatualizado ou incompleto. Peça ao atendente para gerar um novo acesso da mesa."
            accent="warning"
          />
        ) : null}

        {state === "expired" ? (
          <SessionMessageCard
            icon={<Clock3 className="h-5 w-5 text-[hsl(var(--warning))]" />}
            title="Sessão expirada"
            description="A sessão desta mesa já foi encerrada por tempo. Escaneie novamente o QR da mesa para continuar com segurança."
            accent="warning"
          />
        ) : null}

        {state === "blocked" ? (
          <SessionMessageCard
            icon={<Lock className="h-5 w-5 text-[hsl(var(--danger))]" />}
            title="Sessão temporariamente bloqueada"
            description="Identificamos uma proteção ativa para esta sessão. Chame nossa equipe para liberar um novo acesso."
            accent="danger"
          />
        ) : null}

        {state === "error" ? (
          <SessionMessageCard
            icon={<AlertTriangle className="h-5 w-5 text-[hsl(var(--danger))]" />}
            title="Não foi possível carregar a sessão"
            description="Estamos com uma instabilidade momentânea. Tente novamente em alguns instantes ou peça ajuda no salão."
            accent="danger"
          />
        ) : null}
      </section>

      {state === "valid" && session ? (
        <MobileStickyBar>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-[hsl(var(--foreground-muted))]">Carrinho</p>
              <p className="text-sm font-medium">
                {cartCount} {cartCount === 1 ? "item" : "itens"} • {formatCurrency(subtotal)}
              </p>
            </div>
            <AppActionButton className="min-w-36 gap-2" onClick={() => setCartOpen(true)}>
              <ShoppingBag className="h-4 w-4" /> Ver pedido
            </AppActionButton>
          </div>
        </MobileStickyBar>
      ) : null}

      {selectedItem ? (
        <div className="fixed inset-0 z-30 flex items-end bg-[hsl(var(--background)/0.65)] p-3">
          <AppSurface className="max-h-[90vh] w-full max-w-md overflow-y-auto p-0">
            <div className="relative h-48 w-full overflow-hidden border-b border-[hsl(var(--border))]">
              <ItemImage imageUrl={selectedItem.imageUrl} alt={selectedItem.name} />
              <button
                type="button"
                className="absolute right-3 top-3 rounded-full border border-[hsl(var(--border-strong))] bg-[hsl(var(--background)/0.8)] p-2"
                onClick={() => setSelectedItem(null)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 p-4">
              <div className="space-y-2">
                <h3 className="text-xl">{selectedItem.name}</h3>
                <p className="text-sm text-[hsl(var(--foreground-muted))]">{selectedItem.description}</p>
                <p className="text-lg font-semibold">{formatCurrency(selectedItem.price)}</p>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))] px-3 py-2">
                <p className="text-sm">Quantidade</p>
                <div className="flex items-center gap-2">
                  <AppActionButton variant="secondary" className="h-8 w-8 px-0" onClick={() => setDetailQuantity((value) => Math.max(1, value - 1))}>
                    <Minus className="h-4 w-4" />
                  </AppActionButton>
                  <p className="w-8 text-center text-sm font-semibold">{detailQuantity}</p>
                  <AppActionButton variant="secondary" className="h-8 w-8 px-0" onClick={() => setDetailQuantity((value) => value + 1)}>
                    <Plus className="h-4 w-4" />
                  </AppActionButton>
                </div>
              </div>

              <label className="block space-y-2">
                <span className="text-sm">Observações para a cozinha</span>
                <textarea
                  value={detailNotes}
                  onChange={(event) => setDetailNotes(event.target.value)}
                  className="app-field min-h-24 resize-none"
                  maxLength={180}
                  placeholder="Ex.: sem cebola, ponto da carne, trocar acompanhamento"
                />
              </label>

              <AppActionButton className="h-12 w-full justify-between" disabled={!selectedItem.isAvailable} onClick={addToCart}>
                <span>Adicionar ao carrinho</span>
                <span>{formatCurrency(selectedItem.price * detailQuantity)}</span>
              </AppActionButton>

              {!selectedItem.isAvailable ? <p className="text-xs text-[hsl(var(--danger))]">Este item está indisponível no momento.</p> : null}
            </div>
          </AppSurface>
        </div>
      ) : null}

      {cartOpen ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-[hsl(var(--background)/0.55)]">
          <div className="h-full w-full max-w-md overflow-y-auto border-l border-[hsl(var(--border))] bg-[hsl(var(--background-elevated))] p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-[hsl(var(--foreground-muted))]">Seu pedido</p>
                <h3 className="text-xl">Carrinho</h3>
              </div>
              <button type="button" className="rounded-full border border-[hsl(var(--border-strong))] p-2" onClick={() => setCartOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              {cartItems.length === 0 ? (
                <AppSurface className="space-y-2 p-4 text-center">
                  <MenuSquare className="mx-auto h-5 w-5 text-[hsl(var(--foreground-muted))]" />
                  <p className="text-sm">Seu carrinho está vazio. Explore o cardápio e adicione seus favoritos.</p>
                </AppSurface>
              ) : null}

              {cartItems.map((item) => {
                const itemKey = `${item.menuItemId}::${item.notes}`;
                return (
                  <AppSurface key={itemKey} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-semibold">{item.name}</h4>
                        <p className="text-xs text-[hsl(var(--foreground-muted))]">{formatCurrency(item.price)} cada</p>
                      </div>
                      <p className="text-sm font-semibold">{formatCurrency(item.price * item.quantity)}</p>
                    </div>

                    {item.notes ? <p className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-3 py-2 text-xs text-[hsl(var(--foreground-muted))]">Obs: {item.notes}</p> : null}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AppActionButton variant="secondary" className="h-8 w-8 px-0" onClick={() => changeCartQuantity(itemKey, -1)}>
                          <Minus className="h-4 w-4" />
                        </AppActionButton>
                        <span className="w-7 text-center text-sm font-semibold">{item.quantity}</span>
                        <AppActionButton variant="secondary" className="h-8 w-8 px-0" onClick={() => changeCartQuantity(itemKey, 1)}>
                          <Plus className="h-4 w-4" />
                        </AppActionButton>
                      </div>
                      <AppActionButton variant="ghost" className="h-8 px-2 text-[hsl(var(--danger))]" onClick={() => removeFromCart(itemKey)}>
                        Remover
                      </AppActionButton>
                    </div>
                  </AppSurface>
                );
              })}
            </div>

            <AppSurface className="mt-4 space-y-3 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[hsl(var(--foreground-muted))]">Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-[hsl(var(--border))] pt-3 text-base font-semibold">
                <span>Total</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <AppActionButton className="h-12 w-full justify-between" disabled={cartItems.length === 0} onClick={prepareOrder}>
                <span>Enviar pedido</span>
                <ChevronRight className="h-4 w-4" />
              </AppActionButton>
              {preparedMessage ? <p className="text-xs text-[hsl(var(--success))]">{preparedMessage}</p> : null}
            </AppSurface>

            <p className="mt-3 text-center text-xs text-[hsl(var(--foreground-muted))]">
              Pedido vinculado à sessão da mesa. Sem login e com segurança por token válido.
            </p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
