"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3, Minus, Plus, Search, ShoppingBag, Sparkles, X } from "lucide-react";

import { AppActionButton, AppSearchInput, AppSkeleton, AppStatusBadge, AppSurface, MobileStickyBar } from "@/components/ui/app-design-system";
import type { CartItem, MenuCategory, MenuItem, PublicTableData } from "@/lib/types/domain";
import { formatCurrency } from "@/lib/utils/formatters";

type PageState = "loading" | "ready" | "invalid" | "inactive" | "no_session" | "error";

interface PublicMesaPageProps { params: { token: string } }

function MessageCard({ title, description }: { title: string; description: string }): JSX.Element {
  return (
    <AppSurface className="space-y-3 p-6 text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-[hsl(var(--warning))]" />
      <h1 className="text-xl">{title}</h1>
      <p className="text-sm leading-relaxed text-[hsl(var(--foreground-muted))]">{description}</p>
    </AppSurface>
  );
}

function ItemImage({ item }: { item: MenuItem }): JSX.Element {
  if (item.imageUrl) return <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" loading="lazy" />;
  return <div className="flex h-full w-full items-center justify-center bg-[hsl(var(--surface-muted))] text-xs text-[hsl(var(--foreground-muted))]">Sem imagem</div>;
}

export default function PublicMesaPage({ params }: PublicMesaPageProps): JSX.Element {
  const [state, setState] = useState<PageState>("loading");
  const [data, setData] = useState<PublicTableData | null>(null);
  const [message, setMessage] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  const token = useMemo(() => decodeURIComponent(params.token ?? "").trim(), [params.token]);
  const storageKey = data?.session.id ? `qrapido-cart-${data.session.id}` : null;

  useEffect(() => {
    let active = true;
    async function load(): Promise<void> {
      setState("loading");
      try {
        const response = await fetch(`/api/public/table/${encodeURIComponent(token)}`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!active) return;
        if (!response.ok) {
          setMessage(payload.error ?? "Não foi possível carregar esta mesa.");
          setState(response.status === 404 ? "invalid" : response.status === 423 ? "inactive" : response.status === 409 ? "no_session" : "error");
          return;
        }
        setData(payload);
        setActiveCategoryId(payload.categories?.[0]?.id ?? "all");
        setState("ready");
      } catch {
        if (active) {
          setMessage("Não foi possível carregar esta mesa agora.");
          setState("error");
        }
      }
    }
    void load();
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (!storageKey || state !== "ready") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      setCartItems(raw ? JSON.parse(raw) : []);
      Object.keys(window.localStorage).filter((key) => key.startsWith("qrapido-cart-") && key !== storageKey).forEach((key) => window.localStorage.removeItem(key));
    } catch { window.localStorage.removeItem(storageKey); }
  }, [state, storageKey]);

  useEffect(() => {
    if (storageKey && state === "ready") window.localStorage.setItem(storageKey, JSON.stringify(cartItems));
  }, [cartItems, state, storageKey]);

  const categories: MenuCategory[] = data?.categories ?? [];
  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.items ?? []).filter((item) => (activeCategoryId === "all" || item.categoryId === activeCategoryId) && (!term || item.name.toLowerCase().includes(term) || item.description.toLowerCase().includes(term)) && item.isActive && item.isAvailable);
  }, [activeCategoryId, data?.items, search]);
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cartItems.reduce((sum, item) => sum + item.quantity * item.price, 0);

  function addToCart(): void {
    if (!selectedItem || !selectedItem.isActive || !selectedItem.isAvailable) return;
    const trimmedNotes = notes.trim();
    setCartItems((current) => {
      const found = current.find((item) => item.menuItemId === selectedItem.id && item.notes === trimmedNotes);
      if (found) return current.map((item) => item.menuItemId === selectedItem.id && item.notes === trimmedNotes ? { ...item, quantity: item.quantity + quantity } : item);
      return [...current, { menuItemId: selectedItem.id, name: selectedItem.name, price: selectedItem.price, quantity, notes: trimmedNotes, imageUrl: selectedItem.imageUrl }];
    });
    setSelectedItem(null); setQuantity(1); setNotes(""); setCartOpen(true);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_hsl(var(--surface-muted)),_hsl(var(--background))_60%)] px-3 pb-28 pt-4 text-[hsl(var(--foreground))]">
      <section className="mx-auto flex w-full max-w-md flex-col gap-4">
        {state === "loading" ? <><AppSkeleton className="h-32" /><AppSkeleton className="h-14" /><AppSkeleton className="h-36" /></> : null}
        {state === "invalid" ? <MessageCard title="QR Code inválido ou mesa não encontrada." description={message} /> : null}
        {state === "inactive" ? <MessageCard title="Esta mesa está temporariamente indisponível." description={message} /> : null}
        {state === "no_session" ? <MessageCard title="Atendimento ainda não aberto" description="Esta mesa ainda não possui um atendimento aberto. Solicite a liberação a um funcionário." /> : null}
        {state === "error" ? <MessageCard title="Erro ao carregar" description={message} /> : null}

        {state === "ready" && data ? <>
          <AppSurface variant="strong" className="sticky top-3 z-20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs uppercase tracking-[0.16em] text-[hsl(var(--foreground-muted))]">{data.restaurantName ?? "QRápido"}</p><h1 className="text-2xl">Mesa {data.table.number}</h1></div>
              <AppStatusBadge tone="success">Atendimento aberto</AppStatusBadge>
            </div>
          </AppSurface>
          <AppSurface className="space-y-3 p-4">
            <AppSearchInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar no cardápio" />
            <div className="flex gap-2 overflow-x-auto pb-1">
              <AppActionButton variant={activeCategoryId === "all" ? "primary" : "secondary"} className="h-9 shrink-0 rounded-full" onClick={() => setActiveCategoryId("all")}>Todos</AppActionButton>
              {categories.map((category) => <AppActionButton key={category.id} variant={activeCategoryId === category.id ? "primary" : "secondary"} className="h-9 shrink-0 rounded-full" onClick={() => setActiveCategoryId(category.id)}>{category.name}</AppActionButton>)}
            </div>
          </AppSurface>
          {items.length === 0 ? <AppSurface className="p-5 text-center text-sm text-[hsl(var(--foreground-muted))]"><Search className="mx-auto mb-2 h-5 w-5" />Nenhum item disponível nesta categoria.</AppSurface> : null}
          <div className="space-y-3">
            {items.map((item) => <AppSurface key={item.id} className="overflow-hidden p-0"><button type="button" className="w-full text-left" onClick={() => { setSelectedItem(item); setQuantity(1); setNotes(""); }}><div className="flex gap-3 p-3"><div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-[hsl(var(--border-strong))]"><ItemImage item={item} /></div><div className="min-w-0 flex-1 space-y-2"><div className="flex items-start justify-between gap-2"><h2 className="text-base leading-tight">{item.name}</h2>{item.isFeatured ? <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--warning)/0.4)] px-2 py-0.5 text-[10px]"><Sparkles className="h-3 w-3" />Destaque</span> : null}</div><p className="line-clamp-2 text-xs text-[hsl(var(--foreground-muted))]">{item.description}</p><div className="flex items-center justify-between text-sm"><strong>{formatCurrency(item.price)}</strong>{item.preparationTimeMinutes ? <span className="inline-flex items-center gap-1 text-xs text-[hsl(var(--foreground-muted))]"><Clock3 className="h-3 w-3" />{item.preparationTimeMinutes} min</span> : null}</div></div></div></button></AppSurface>)}
          </div>
        </> : null}
      </section>
      {state === "ready" ? <MobileStickyBar><div className="flex items-center justify-between"><p className="text-sm"><span className="font-semibold">{cartCount} item(ns)</span><br />{formatCurrency(subtotal)}</p><AppActionButton className="gap-2" onClick={() => setCartOpen(true)}><ShoppingBag className="h-4 w-4" />Carrinho</AppActionButton></div></MobileStickyBar> : null}
      {selectedItem ? <div className="fixed inset-0 z-40 flex items-end bg-black/50 p-3"><AppSurface className="w-full max-w-md p-4"><div className="mb-3 flex items-start justify-between"><h2 className="text-xl">{selectedItem.name}</h2><button onClick={() => setSelectedItem(null)}><X className="h-5 w-5" /></button></div><p className="mb-3 text-sm text-[hsl(var(--foreground-muted))]">{selectedItem.description}</p><div className="mb-3 flex items-center justify-between"><strong>{formatCurrency(selectedItem.price)}</strong><div className="flex items-center gap-2"><AppActionButton variant="secondary" className="h-8 w-8 px-0" onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus className="h-4 w-4" /></AppActionButton><span>{quantity}</span><AppActionButton variant="secondary" className="h-8 w-8 px-0" onClick={() => setQuantity(quantity + 1)}><Plus className="h-4 w-4" /></AppActionButton></div></div><textarea className="app-field mb-3 min-h-20" value={notes} maxLength={180} onChange={(event) => setNotes(event.target.value)} placeholder="Observação do item" /><AppActionButton className="w-full justify-between" onClick={addToCart}><span>Adicionar produto</span><span>{formatCurrency(selectedItem.price * quantity)}</span></AppActionButton></AppSurface></div> : null}
      {cartOpen ? <div className="fixed inset-0 z-50 flex justify-end bg-black/50"><div className="h-full w-full max-w-md overflow-y-auto bg-[hsl(var(--background-elevated))] p-4"><div className="mb-4 flex justify-between"><h2 className="text-xl">Carrinho</h2><button onClick={() => setCartOpen(false)}><X className="h-5 w-5" /></button></div>{cartItems.length === 0 ? <p className="text-sm text-[hsl(var(--foreground-muted))]">Seu carrinho está vazio.</p> : null}{cartItems.map((item) => { const key = `${item.menuItemId}::${item.notes}`; return <AppSurface key={key} className="mb-3 p-3"><div className="flex justify-between gap-2"><strong className="text-sm">{item.name}</strong><span>{formatCurrency(item.price * item.quantity)}</span></div>{item.notes ? <p className="mt-2 text-xs text-[hsl(var(--foreground-muted))]">Obs: {item.notes}</p> : null}<div className="mt-3 flex items-center justify-between"><div className="flex items-center gap-2"><AppActionButton variant="secondary" className="h-8 w-8 px-0" onClick={() => setCartItems((current) => current.map((cartItem) => `${cartItem.menuItemId}::${cartItem.notes}` === key ? { ...cartItem, quantity: Math.max(0, cartItem.quantity - 1) } : cartItem).filter((cartItem) => cartItem.quantity > 0))}><Minus className="h-4 w-4" /></AppActionButton><span>{item.quantity}</span><AppActionButton variant="secondary" className="h-8 w-8 px-0" onClick={() => setCartItems((current) => current.map((cartItem) => `${cartItem.menuItemId}::${cartItem.notes}` === key ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem))}><Plus className="h-4 w-4" /></AppActionButton></div><AppActionButton variant="ghost" onClick={() => setCartItems((current) => current.filter((cartItem) => `${cartItem.menuItemId}::${cartItem.notes}` !== key))}>Remover</AppActionButton></div></AppSurface>; })}<AppSurface className="mt-4 p-4"><div className="mb-3 flex justify-between"><span>Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div><AppActionButton variant="secondary" className="w-full" onClick={() => { if (confirm("Limpar carrinho?")) setCartItems([]); }}>Limpar carrinho</AppActionButton><p className="mt-3 text-xs text-[hsl(var(--foreground-muted))]">Finalização do pedido será habilitada na próxima etapa.</p></AppSurface></div></div> : null}
    </main>
  );
}
