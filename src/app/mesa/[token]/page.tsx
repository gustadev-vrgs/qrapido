"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, CheckCircle2, Clock3, Loader2, Lock, Minus, Plus, Search, ShoppingBag, Sparkles, X } from "lucide-react";

import { AppActionButton, AppSearchInput, AppSkeleton, AppStatusBadge, AppSurface, MobileStickyBar } from "@/components/ui/app-design-system";
import type { CartItem, MenuCategory, MenuItem, PublicTableData } from "@/lib/types/domain";
import { formatCurrency } from "@/lib/utils/formatters";

type PageState = "loading" | "locked" | "ready" | "invalid" | "inactive" | "no_session" | "error";

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
  if (item.imageUrl) return <Image src={item.imageUrl} alt={item.name} width={160} height={160} className="h-full w-full object-cover" unoptimized />;
  return <div className="flex h-full w-full items-center justify-center bg-[hsl(var(--surface-muted))] text-xs text-[hsl(var(--foreground-muted))]">Sem imagem</div>;
}

export default function PublicMesaPage({ params }: PublicMesaPageProps): JSX.Element {
  const [state, setState] = useState<PageState>("loading");
  const [data, setData] = useState<PublicTableData | null>(null);
  const [message, setMessage] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [csrfToken, setCsrfToken] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [generalNotes, setGeneralNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "credit_card" | "debit_card" | "cash">("pix");
  const [paymentMode, setPaymentMode] = useState<"system_simulated" | "counter" | "waiter">("system_simulated");
  const [changeFor, setChangeFor] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState<{ orderId: string; orderCode: string } | null>(null);
  const [feedback, setFeedback] = useState("");
  const [waiterOpen, setWaiterOpen] = useState(false);
  const [waiterReason, setWaiterReason] = useState("fazer pagamento");
  const [callingWaiter, setCallingWaiter] = useState(false);

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
          setMessage(payload.error ?? "Não foi possível carregar os dados da mesa. Tente novamente ou solicite ajuda a um funcionário.");
          setState(response.status === 404 ? "invalid" : response.status === 423 ? "inactive" : response.status === 409 ? "no_session" : response.status === 401 ? "locked" : "error");
          return;
        }
        setData(payload);
        setCsrfToken(window.sessionStorage.getItem("qrapido-csrf") ?? "");
        setActiveCategoryId(payload.categories?.[0]?.id ?? "all");
        setState("ready");
      } catch {
        if (active) {
          setMessage("Não foi possível carregar os dados da mesa. Tente novamente ou solicite ajuda a um funcionário.");
          setState("error");
        }
      }
    }
    void load();
    return () => { active = false; };
  }, [token]);

  async function authorize(): Promise<void> {
    setMessage("");
    const response = await fetch("/api/public/session/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicToken: token, accessCode }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(payload.error ?? "Não foi possível liberar esta mesa."); return; }
    window.sessionStorage.setItem("qrapido-csrf", payload.csrfToken);
    setCsrfToken(payload.csrfToken);
    window.location.reload();
  }

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

  async function submitOrder(): Promise<void> {
    if (!data || cartItems.length === 0 || submitting) return;
    setSubmitting(true); setFeedback("");
    try {
      const response = await fetch("/api/public/order", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken }, body: JSON.stringify({
        items: cartItems.map((item) => ({ menuItemId: item.menuItemId, quantity: item.quantity, notes: item.notes || null })),
        duplicateFingerprint: `${Date.now()}-${cartItems.map((item) => `${item.menuItemId}:${item.quantity}:${item.notes}`).join("|")}`,
        customerName: customerName.trim() || null, notes: generalNotes.trim() || null, paymentMethod, paymentMode, changeFor: changeFor ? Number(changeFor.replace(",", ".")) : null
      }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { setFeedback(payload.error ?? "Não foi possível criar o pedido."); return; }
      setOrderResult({ orderId: payload.orderId, orderCode: payload.orderCode });
      setCartItems([]); if (storageKey) window.localStorage.removeItem(storageKey);
    } catch { setFeedback("Falha de conexão ao finalizar pedido."); } finally { setSubmitting(false); }
  }

  async function callWaiter(): Promise<void> {
    if (!data || callingWaiter) return;
    setCallingWaiter(true); setFeedback("");
    try {
      const response = await fetch("/api/public/waiter-call", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken }, body: JSON.stringify({ reason: waiterReason }) });
      const payload = await response.json().catch(() => ({}));
      setFeedback(response.ok ? "Chamado enviado para a equipe." : payload.error ?? "Não foi possível chamar o garçom.");
      if (response.ok) setWaiterOpen(false);
    } catch { setFeedback("Falha de conexão ao chamar o garçom."); } finally { setCallingWaiter(false); }
  }

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
        {state === "no_session" ? <MessageCard title="Esta mesa ainda não possui um atendimento aberto." description="Esta mesa ainda não possui um atendimento aberto. Solicite a liberação a um funcionário." /> : null}
        {state === "locked" ? <AppSurface className="space-y-4 p-6 text-center"><Lock className="mx-auto h-8 w-8 text-[hsl(var(--warning))]" /><h1 className="text-xl">Código do atendimento necessário</h1><p className="text-sm text-[hsl(var(--foreground-muted))]">O QR identifica a mesa, mas não autoriza pedidos. Solicite presencialmente à equipe o código temporário de 6 dígitos.</p><input className="app-field text-center text-xl tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={accessCode} onChange={(e) => setAccessCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" />{message ? <p className="text-sm text-[hsl(var(--danger))]">{message}</p> : null}<AppActionButton className="w-full" disabled={accessCode.length !== 6} onClick={() => void authorize()}>Liberar este celular</AppActionButton></AppSurface> : null}
        {state === "error" ? <MessageCard title="Erro ao carregar" description={message} /> : null}

        {state === "ready" && data ? <>
          <AppSurface variant="strong" className="sticky top-3 z-20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs uppercase tracking-[0.16em] text-[hsl(var(--foreground-muted))]">{data.restaurantName ?? "QRápido"}</p><h1 className="text-2xl">Mesa {data.table.number}</h1></div>
              <AppStatusBadge tone="success">Atendimento aberto</AppStatusBadge>
            </div>
            <div className="mt-3 flex gap-2"><AppActionButton variant="secondary" className="gap-2" onClick={() => setWaiterOpen(true)}><Bell className="h-4 w-4" />Chamar garçom</AppActionButton></div>{feedback ? <p className="mt-2 text-xs text-[hsl(var(--foreground-muted))]">{feedback}</p> : null}
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
      {cartOpen ? <div className="fixed inset-0 z-50 flex justify-end bg-black/50"><div className="h-full w-full max-w-md overflow-y-auto bg-[hsl(var(--background-elevated))] p-4"><div className="mb-4 flex justify-between"><h2 className="text-xl">Carrinho</h2><button onClick={() => setCartOpen(false)}><X className="h-5 w-5" /></button></div>{cartItems.length === 0 ? <p className="text-sm text-[hsl(var(--foreground-muted))]">Seu carrinho está vazio.</p> : null}{cartItems.map((item) => { const key = `${item.menuItemId}::${item.notes}`; return <AppSurface key={key} className="mb-3 p-3"><div className="flex justify-between gap-2"><strong className="text-sm">{item.name}</strong><span>{formatCurrency(item.price * item.quantity)}</span></div>{item.notes ? <p className="mt-2 text-xs text-[hsl(var(--foreground-muted))]">Obs: {item.notes}</p> : null}<div className="mt-3 flex items-center justify-between"><div className="flex items-center gap-2"><AppActionButton variant="secondary" className="h-8 w-8 px-0" onClick={() => setCartItems((current) => current.map((cartItem) => `${cartItem.menuItemId}::${cartItem.notes}` === key ? { ...cartItem, quantity: Math.max(0, cartItem.quantity - 1) } : cartItem).filter((cartItem) => cartItem.quantity > 0))}><Minus className="h-4 w-4" /></AppActionButton><span>{item.quantity}</span><AppActionButton variant="secondary" className="h-8 w-8 px-0" onClick={() => setCartItems((current) => current.map((cartItem) => `${cartItem.menuItemId}::${cartItem.notes}` === key ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem))}><Plus className="h-4 w-4" /></AppActionButton></div><AppActionButton variant="ghost" onClick={() => setCartItems((current) => current.filter((cartItem) => `${cartItem.menuItemId}::${cartItem.notes}` !== key))}>Remover</AppActionButton></div></AppSurface>; })}<AppSurface className="mt-4 p-4"><div className="mb-3 flex justify-between"><span>Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div><div className="grid gap-2"><AppActionButton className="w-full" onClick={() => setCheckoutOpen(true)}>Continuar pedido</AppActionButton><AppActionButton variant="secondary" className="w-full" onClick={() => { if (confirm("Limpar carrinho?")) setCartItems([]); }}>Limpar carrinho</AppActionButton></div></AppSurface></div></div> : null}

      {checkoutOpen && data ? <div className="fixed inset-0 z-[60] flex justify-end bg-black/50"><div className="h-full w-full max-w-md overflow-y-auto bg-[hsl(var(--background-elevated))] p-4"><div className="mb-4 flex justify-between"><h2 className="text-xl">Checkout</h2><button onClick={() => setCheckoutOpen(false)}><X className="h-5 w-5" /></button></div>{orderResult ? <AppSurface className="space-y-3 p-4 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-[hsl(var(--success))]" /><h3 className="text-lg">Pedido {orderResult.orderCode} recebido</h3><p>Mesa {data.table.number}</p>{cartItems.length === 0 ? null : null}<AppActionButton className="w-full" onClick={() => { window.location.href = `/mesa/${encodeURIComponent(token)}/pedido/${orderResult.orderId}`; }}>Acompanhar pedido</AppActionButton></AppSurface> : <div className="space-y-3"><AppSurface className="space-y-2 p-3"><h3 className="font-semibold">Resumo</h3>{cartItems.map((item) => <div key={`${item.menuItemId}-${item.notes}`} className="flex justify-between text-sm"><span>{item.quantity}x {item.name}{item.notes ? ` — ${item.notes}` : ""}</span><strong>{formatCurrency(item.quantity * item.price)}</strong></div>)}<div className="flex justify-between border-t border-[hsl(var(--border))] pt-2"><span>Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div><p className="text-xs text-[hsl(var(--foreground-muted))]">Os preços e o subtotal serão recalculados no servidor antes da criação do pedido.</p></AppSurface><input className="app-field" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nome do cliente (opcional)" /><textarea className="app-field min-h-20" value={generalNotes} onChange={(e) => setGeneralNotes(e.target.value)} placeholder="Observação geral (opcional)" /><select className="app-field" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as any)}><option value="pix">PIX</option><option value="credit_card">Cartão de crédito</option><option value="debit_card">Cartão de débito</option><option value="cash">Dinheiro</option></select><select className="app-field" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as any)}><option value="system_simulated">Pagar pelo sistema (simulado)</option><option value="counter">Pagar no caixa</option><option value="waiter">Chamar garçom</option></select>{paymentMethod === "cash" ? <input className="app-field" value={changeFor} onChange={(e) => setChangeFor(e.target.value)} placeholder="Troco para quanto? (opcional)" /> : null}{paymentMethod === "pix" && paymentMode === "system_simulated" ? <AppSurface className="space-y-2 p-3 text-sm"><div className="mx-auto flex h-32 w-32 items-center justify-center rounded-xl bg-white text-black">QR PIX<br />simulado</div><p><strong>Chave/CNPJ:</strong> {(data as any).settings?.pixKey ?? "Não cadastrada"}</p><p><strong>Recebedor:</strong> {(data as any).settings?.pixReceiverName ?? data.restaurantName ?? "Restaurante"}</p><p><strong>Copia e cola:</strong> QRAPIDO-PIX-SIMULADO-{data.table.number}-{subtotal.toFixed(2)}</p><p className="text-xs text-[hsl(var(--danger))]">Simulação acadêmica. Não representa pagamento bancário real.</p></AppSurface> : null}{paymentMethod.includes("card") ? <AppSurface className="p-3 text-sm">Não informe dados reais do cartão. A confirmação é simulada ou feita na máquina do restaurante.</AppSurface> : null}{feedback ? <p className="text-sm text-[hsl(var(--danger))]">{feedback}</p> : null}<AppActionButton className="w-full gap-2" onClick={() => void submitOrder()} disabled={submitting}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Confirmar pedido</AppActionButton></div>}</div></div> : null}
      {waiterOpen ? <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"><AppSurface className="w-full max-w-md space-y-3 p-4"><h2 className="text-lg">Chamar garçom</h2><select className="app-field" value={waiterReason} onChange={(e) => setWaiterReason(e.target.value)}><option>fazer pagamento</option><option>pedir ajuda</option><option>solicitar talheres</option><option>outra necessidade</option></select><div className="flex gap-2"><AppActionButton variant="secondary" onClick={() => setWaiterOpen(false)}>Cancelar</AppActionButton><AppActionButton onClick={() => void callWaiter()} disabled={callingWaiter}>{callingWaiter ? "Enviando..." : "Enviar chamado"}</AppActionButton></div></AppSurface></div> : null}
    </main>
  );
}
