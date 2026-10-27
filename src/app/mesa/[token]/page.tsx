"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, CheckCircle2, ChefHat, Clock3, KeyRound, Loader2, Minus, Plus, ReceiptText, RefreshCw, Search, ShoppingBag, Sparkles, X } from "lucide-react";

import { AppActionButton, AppSearchInput, AppSkeleton, AppStatusBadge, AppSurface, MobileStickyBar } from "@/components/ui/app-design-system";
import { customerStatusLabel } from "@/lib/utils/customer-order-status";
import type { CartItem, PaymentMethod, PublicMenuItem, PublicOrder, PublicTableData } from "@/lib/types/domain";
import { randomKey, readStored, storageKeys, writeStored } from "@/lib/utils/customer-storage";
import { formatCurrency } from "@/lib/utils/formatters";

type LoadState = { kind: "loading" } | { kind: "error"; title: string; message: string } | { kind: "ready"; data: PublicTableData };
type PaymentMode = "counter" | "waiter" | "system_simulated";

const PAYMENT_LABELS: Record<string, string> = { pix: "PIX", cash: "Dinheiro", debit_card: "Cartão de débito", credit_card: "Cartão de crédito" };
const CUSTOMER_METHODS = ["pix", "cash", "debit_card", "credit_card"] as const;
const WAITER_REASONS = ["fazer pagamento", "pedir ajuda", "solicitar talheres", "outra necessidade"] as const;
const ORDER_TONE: Record<string, "info" | "warning" | "success" | "neutral" | "danger"> = { received: "info", confirmed: "info", in_preparation: "warning", ready: "success", delivered: "neutral", cancelled: "danger" };

function ItemImage({ item, size = 96 }: { item: PublicMenuItem; size?: number }): JSX.Element {
  if (item.imageUrl) return <Image src={item.imageUrl} alt={item.name} width={size} height={size} className="h-full w-full object-cover" unoptimized />;
  return <div className="flex h-full w-full items-center justify-center bg-[hsl(var(--surface-muted))] text-[10px] text-[hsl(var(--foreground-muted))]">sem foto</div>;
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[hsl(var(--background-elevated))] p-4 sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-xl">{title}</h2><button type="button" onClick={onClose} aria-label="Fechar" className="rounded-full p-2 hover:bg-[hsl(var(--surface-muted))]"><X className="h-5 w-5" /></button></div>
        {children}
      </div>
    </div>
  );
}

export default function PublicMesaPage({ params }: { params: { token: string } }): JSX.Element {
  const token = useMemo(() => decodeURIComponent(params.token ?? "").trim(), [params.token]);
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [csrf, setCsrf] = useState("");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [authorizing, setAuthorizing] = useState(false);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PublicMenuItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [itemNotes, setItemNotes] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [panel, setPanel] = useState<"none" | "cart" | "checkout" | "orders" | "waiter" | "code">("none");
  const [customerName, setCustomerName] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("counter");
  const [changeFor, setChangeFor] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [lastOrder, setLastOrder] = useState<{ id: string; code: string; split: boolean; drinksOnly: boolean } | null>(null);
  const [orders, setOrders] = useState<PublicOrder[]>([]);
  const [waiterReason, setWaiterReason] = useState<(typeof WAITER_REASONS)[number]>("pedir ajuda");
  const [notice, setNotice] = useState("");

  const data = load.kind === "ready" ? load.data : null;
  const access = data?.access;

  const fetchTable = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    try {
      const response = await fetch(`/api/public/table/${encodeURIComponent(token)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const title = response.status === 404 ? "QR Code não reconhecido" : response.status === 423 ? "Mesa indisponível" : "Não foi possível abrir o cardápio";
        setLoad({ kind: "error", title, message: payload.error ?? "Tente novamente em instantes ou chame um atendente." });
        return;
      }
      setLoad({ kind: "ready", data: payload as PublicTableData });
    } catch {
      setLoad({ kind: "error", title: "Sem conexão", message: "Verifique a internet do celular (ou o Wi-Fi do restaurante) e tente novamente." });
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  const fetchOrders = useCallback(async () => {
    try {
      const response = await fetch("/api/public/orders", { cache: "no-store" });
      if (response.ok) setOrders(((await response.json()) as { orders: PublicOrder[] }).orders ?? []);
    } catch { /* keeps the last list */ }
  }, []);

  useEffect(() => {
    setCsrf(readStored(storageKeys.csrf(token), ""));
    setCart(readStored<CartItem[]>(storageKeys.cart(token), []));
    void fetchTable();
  }, [fetchTable, token]);

  useEffect(() => { writeStored(storageKeys.cart(token), cart.length ? cart : null); }, [cart, token]);

  // Keep the table state fresh: the team may open the table or renew the attendance while the customer waits.
  useEffect(() => {
    if (load.kind !== "ready") return;
    const id = window.setInterval(() => void fetchTable(true), access === "authorized" ? 60_000 : 15_000);
    return () => window.clearInterval(id);
  }, [access, fetchTable, load.kind]);

  useEffect(() => {
    if (access !== "authorized" && orders.length === 0) return;
    void fetchOrders();
    const id = window.setInterval(() => void fetchOrders(), panel === "orders" ? 8_000 : 30_000);
    return () => window.clearInterval(id);
  }, [access, fetchOrders, orders.length, panel]);

  // Drop cart lines that left the menu and refresh prices.
  useEffect(() => {
    if (!data) return;
    const byId = new Map(data.items.map((item) => [item.id, item]));
    setCart((current) => {
      const next = current.filter((line) => byId.has(line.menuItemId)).map((line) => ({ ...line, price: byId.get(line.menuItemId)!.price, name: byId.get(line.menuItemId)!.name }));
      if (next.length !== current.length) setNotice("Alguns itens saíram do cardápio e foram removidos do carrinho.");
      return next;
    });
    const accepted = data.settings.acceptedPaymentMethods.filter((method) => (CUSTOMER_METHODS as readonly string[]).includes(method));
    setPaymentMethod((current) => (accepted.includes(current) ? current : (accepted[0] ?? "cash")));
  }, [data]);

  const acceptedMethods = (data?.settings.acceptedPaymentMethods ?? []).filter((method) => (CUSTOMER_METHODS as readonly string[]).includes(method));
  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.items ?? []).filter((item) => (category === "all" || item.categoryId === category) && (!term || `${item.name} ${item.description}`.toLowerCase().includes(term)));
  }, [category, data?.items, search]);
  const featured = (data?.items ?? []).filter((item) => item.isFeatured);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = Math.round(cart.reduce((sum, item) => sum + item.quantity * item.price, 0) * 100) / 100;
  const feePercent = data?.settings.serviceFeePercent ?? 0;
  const serviceFee = Math.round(subtotal * feePercent) / 100;
  const total = Math.round((subtotal + serviceFee) * 100) / 100;
  const activeOrders = orders.filter((order) => !["delivered", "cancelled"].includes(order.status)).length;

  async function authorize(): Promise<boolean> {
    if (code.length !== 6 || authorizing) return false;
    setAuthorizing(true);
    setCodeError("");
    try {
      const response = await fetch("/api/public/session/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicToken: token, accessCode: code }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { setCodeError(payload.error ?? "Não foi possível liberar este celular."); return false; }
      writeStored(storageKeys.csrf(token), payload.csrfToken);
      setCsrf(payload.csrfToken);
      setCode("");
      await fetchTable(true);
      return true;
    } catch {
      setCodeError("Sem conexão. Tente novamente.");
      return false;
    } finally {
      setAuthorizing(false);
    }
  }

  /** The cookie or the CSRF token is gone (other tab, cleared data, table reopened): ask for the code again, keeping the cart. */
  function requireCode(message: string) {
    writeStored(storageKeys.csrf(token), null);
    setCsrf("");
    setCodeError(message);
    setPanel("code");
    void fetchTable(true);
  }

  function addToCart(): void {
    if (!selected) return;
    const notes = itemNotes.trim();
    setCart((current) => {
      const found = current.find((line) => line.menuItemId === selected.id && line.notes === notes);
      if (found) return current.map((line) => (line === found ? { ...line, quantity: Math.min(20, line.quantity + quantity) } : line));
      return [...current, { menuItemId: selected.id, name: selected.name, price: selected.price, quantity, notes, imageUrl: selected.imageUrl }];
    });
    setSelected(null);
    setNotice(`${quantity}x ${selected.name} no carrinho`);
  }

  function changeLine(index: number, delta: number): void {
    setCart((current) => current.map((line, position) => (position === index ? { ...line, quantity: Math.min(20, line.quantity + delta) } : line)).filter((line) => line.quantity > 0));
  }

  function goToCheckout(): void {
    setFeedback("");
    if (access === "authorized") setPanel("checkout");
    else if (access === "needs_code") setPanel("code");
    else setPanel("cart");
  }

  async function submitOrder(retry = false): Promise<void> {
    if (!data || cart.length === 0 || (submitting && !retry)) return;
    if (data.settings.requireCustomerName && !customerName.trim()) { setFeedback("Informe seu nome para enviar o pedido."); return; }
    const change = changeFor.trim() ? Number(changeFor.replace(/\./g, "").replace(",", ".")) : null;
    if (paymentMethod === "cash" && change !== null && (!Number.isFinite(change) || change < total)) { setFeedback(`O troco deve ser para um valor igual ou maior que ${formatCurrency(total)}.`); return; }
    setSubmitting(true);
    setFeedback("");
    // Same key on a network retry so the order is never duplicated.
    let attempt = readStored<string>(storageKeys.attempt(token), "");
    if (!attempt) { attempt = randomKey(); writeStored(storageKeys.attempt(token), attempt); }
    try {
      const response = await fetch("/api/public/order", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf, "Idempotency-Key": attempt },
        body: JSON.stringify({
          items: cart.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity, notes: line.notes || null })),
          customerName: customerName.trim() || null,
          notes: orderNotes.trim() || null,
          paymentMethod,
          paymentMode,
          changeFor: paymentMethod === "cash" ? change : null
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) { writeStored(storageKeys.attempt(token), null); requireCode("Para enviar o pedido, digite novamente o código da mesa."); return; }
      if (!response.ok) {
        if (payload.code === "idempotency_conflict" && !retry) { writeStored(storageKeys.attempt(token), null); await submitOrder(true); return; }
        if (response.status < 500) writeStored(storageKeys.attempt(token), null);
        setFeedback(payload.error ?? "Não foi possível enviar o pedido.");
        if (["session_expired", "no_session", "session_inactive"].includes(payload.code)) void fetchTable(true);
        return;
      }
      writeStored(storageKeys.attempt(token), null);
      const parts = Array.isArray(payload.orders) ? payload.orders as Array<{ station: string }> : [];
      setLastOrder({ id: payload.orderId, code: payload.groupCode ?? payload.orderCode, split: parts.length > 1, drinksOnly: parts.length === 1 && parts[0].station === "ready" });
      setCart([]);
      setOrderNotes("");
      setChangeFor("");
      void fetchOrders();
    } catch {
      setFeedback("A conexão caiu. Toque em enviar de novo: o pedido não será duplicado.");
    } finally {
      setSubmitting(false);
    }
  }

  async function callWaiter(): Promise<void> {
    try {
      const response = await fetch("/api/public/waiter-call", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify({ reason: waiterReason }) });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) { requireCode("Para chamar o garçom pelo celular, digite o código da mesa."); return; }
      setNotice(response.ok ? "Chamado enviado. Um atendente já vem até a mesa." : payload.error ?? "Não foi possível chamar o garçom.");
      if (response.ok || response.status === 409) setPanel("none");
    } catch {
      setNotice("Sem conexão para chamar o garçom. Chame um atendente pessoalmente.");
    }
  }

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(id);
  }, [notice]);

  const codeForm = (
    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void authorize().then((ok) => { if (ok && panel === "code") setPanel(cart.length ? "checkout" : "none"); }); }}>
      <input className="app-field text-center text-2xl tracking-[0.5em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" aria-label="Código de 6 dígitos" />
      {codeError ? <p className="text-sm text-[hsl(var(--danger))]">{codeError}</p> : null}
      <AppActionButton type="submit" className="w-full gap-2" disabled={code.length !== 6 || authorizing}>{authorizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Liberar este celular</AppActionButton>
    </form>
  );

  if (load.kind === "loading") {
    return <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-3 pt-4"><AppSkeleton className="h-28" /><AppSkeleton className="h-14" /><AppSkeleton className="h-32" /><AppSkeleton className="h-32" /></main>;
  }

  if (load.kind === "error") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
        <AppSurface className="w-full space-y-3 p-6 text-center">
          <AlertTriangle className="mx-auto h-9 w-9 text-[hsl(var(--warning))]" />
          <h1 className="text-xl">{load.title}</h1>
          <p className="text-sm text-[hsl(var(--foreground-muted))]">{load.message}</p>
          <AppActionButton className="w-full gap-2" onClick={() => { setLoad({ kind: "loading" }); void fetchTable(); }}><RefreshCw className="h-4 w-4" />Tentar de novo</AppActionButton>
        </AppSurface>
      </main>
    );
  }

  const loaded = load.data;
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_hsl(var(--surface-muted)),_hsl(var(--background))_60%)] px-3 pb-32 pt-4 text-[hsl(var(--foreground))]">
      <section className="mx-auto flex w-full max-w-md flex-col gap-4">
        <AppSurface variant="strong" className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs uppercase tracking-[0.16em] text-[hsl(var(--foreground-muted))]">{loaded.restaurantName ?? "Cardápio"}</p><h1 className="text-2xl">{loaded.table.label}</h1></div>
            <AppStatusBadge tone={access === "authorized" ? "success" : access === "needs_code" ? "info" : "warning"}>{access === "authorized" ? "Pedidos liberados" : access === "needs_code" ? "Mesa aberta" : access === "expired" ? "Pausado" : "Só cardápio"}</AppStatusBadge>
          </div>

          {access === "no_session" ? (
            <div className="mt-3 space-y-2 text-sm">
              <p>Esta mesa ainda não foi aberta pela equipe. Você já pode ver o cardápio e montar o carrinho; para enviar o pedido, chame um atendente.</p>
              <AppActionButton variant="secondary" className="gap-2" disabled={refreshing} onClick={() => void fetchTable(true)}>{refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Já abriram a mesa? Atualizar</AppActionButton>
            </div>
          ) : null}
          {access === "expired" ? (
            <div className="mt-3 space-y-2 text-sm">
              <p>O tempo deste atendimento acabou e os pedidos estão pausados. Peça a um atendente para renovar.</p>
              <AppActionButton variant="secondary" className="gap-2" disabled={refreshing} onClick={() => void fetchTable(true)}><RefreshCw className="h-4 w-4" />Atualizar</AppActionButton>
            </div>
          ) : null}
          {access === "needs_code" ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm">Digite o código de 6 dígitos que o atendente passou para a sua mesa.</p>
              {codeForm}
            </div>
          ) : null}
          {access === "authorized" && loaded.settings.allowWaiterCall ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <AppActionButton variant="secondary" className="gap-2" onClick={() => setPanel("waiter")}><Bell className="h-4 w-4" />Chamar garçom</AppActionButton>
              {orders.length ? <AppActionButton variant="secondary" className="gap-2" onClick={() => setPanel("orders")}><ReceiptText className="h-4 w-4" />Meus pedidos{activeOrders ? ` (${activeOrders})` : ""}</AppActionButton> : null}
            </div>
          ) : null}
        </AppSurface>

        <AppSurface className="sticky top-2 z-20 space-y-3 p-3">
          <AppSearchInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar no cardápio" />
          <div className="flex gap-2 overflow-x-auto pb-1">
            <AppActionButton variant={category === "all" ? "primary" : "secondary"} className="h-9 shrink-0 rounded-full" onClick={() => setCategory("all")}>Todos</AppActionButton>
            {loaded.categories.map((item) => <AppActionButton key={item.id} variant={category === item.id ? "primary" : "secondary"} className="h-9 shrink-0 rounded-full" onClick={() => setCategory(item.id)}>{item.name}</AppActionButton>)}
          </div>
        </AppSurface>

        {category === "all" && !search && featured.length ? (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {featured.map((item) => (
              <button key={item.id} type="button" onClick={() => { setSelected(item); setQuantity(1); setItemNotes(""); }} className="w-40 shrink-0 overflow-hidden rounded-2xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--background-elevated))] text-left">
                <div className="h-24 w-full"><ItemImage item={item} size={160} /></div>
                <div className="p-2"><p className="flex items-center gap-1 text-[10px] uppercase text-[hsl(var(--warning))]"><Sparkles className="h-3 w-3" />Destaque</p><p className="line-clamp-1 text-sm font-semibold">{item.name}</p><p className="text-sm">{formatCurrency(item.price)}</p></div>
              </button>
            ))}
          </div>
        ) : null}

        {loaded.items.length === 0 ? <AppSurface className="p-5 text-center text-sm text-[hsl(var(--foreground-muted))]">O cardápio ainda está sendo preparado. Chame um atendente.</AppSurface> : null}
        {loaded.items.length > 0 && items.length === 0 ? <AppSurface className="p-5 text-center text-sm text-[hsl(var(--foreground-muted))]"><Search className="mx-auto mb-2 h-5 w-5" />Nada encontrado.</AppSurface> : null}
        <div className="space-y-3">
          {items.map((item) => (
            <AppSurface key={item.id} className="overflow-hidden p-0">
              <button type="button" className="flex w-full gap-3 p-3 text-left" onClick={() => { setSelected(item); setQuantity(1); setItemNotes(""); }}>
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-[hsl(var(--border-strong))]"><ItemImage item={item} /></div>
                <div className="min-w-0 flex-1 space-y-1">
                  <h2 className="text-base leading-tight">{item.name}</h2>
                  {item.description ? <p className="line-clamp-2 text-xs text-[hsl(var(--foreground-muted))]">{item.description}</p> : null}
                  <div className="flex items-center justify-between pt-1 text-sm"><strong>{formatCurrency(item.price)}</strong>{item.preparationTimeMinutes ? <span className="inline-flex items-center gap-1 text-xs text-[hsl(var(--foreground-muted))]"><Clock3 className="h-3 w-3" />{item.preparationTimeMinutes} min</span> : null}</div>
                </div>
              </button>
            </AppSurface>
          ))}
        </div>
      </section>

      {notice ? <div className="fixed inset-x-3 top-3 z-[80] mx-auto max-w-md rounded-2xl bg-[hsl(var(--foreground))] px-4 py-3 text-sm text-[hsl(var(--background))] shadow-lg" role="status">{notice}</div> : null}

      {cartCount > 0 || orders.length > 0 ? (
        <MobileStickyBar className="fixed inset-x-3 bottom-3 z-30">
          <div className="flex items-center justify-between gap-2">
            {orders.length && cartCount === 0 ? <AppActionButton variant="secondary" className="gap-2" onClick={() => setPanel("orders")}><ChefHat className="h-4 w-4" />Meus pedidos{activeOrders ? ` (${activeOrders})` : ""}</AppActionButton> : <p className="text-sm"><span className="font-semibold">{cartCount} item(ns)</span><br />{formatCurrency(subtotal)}</p>}
            {cartCount > 0 ? <AppActionButton className="gap-2" onClick={() => setPanel("cart")}><ShoppingBag className="h-4 w-4" />Ver carrinho</AppActionButton> : null}
          </div>
        </MobileStickyBar>
      ) : null}

      {selected ? (
        <Sheet title={selected.name} onClose={() => setSelected(null)}>
          {selected.imageUrl ? <div className="mb-3 h-48 overflow-hidden rounded-2xl"><ItemImage item={selected} size={400} /></div> : null}
          {selected.description ? <p className="mb-3 text-sm text-[hsl(var(--foreground-muted))]">{selected.description}</p> : null}
          <div className="mb-3 flex items-center justify-between">
            <strong>{formatCurrency(selected.price)}</strong>
            <div className="flex items-center gap-3">
              <AppActionButton variant="secondary" className="h-9 w-9 px-0" aria-label="Diminuir" onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus className="h-4 w-4" /></AppActionButton>
              <span className="w-6 text-center text-lg">{quantity}</span>
              <AppActionButton variant="secondary" className="h-9 w-9 px-0" aria-label="Aumentar" onClick={() => setQuantity(Math.min(20, quantity + 1))}><Plus className="h-4 w-4" /></AppActionButton>
            </div>
          </div>
          {loaded.settings.allowCustomerNotes ? <textarea className="app-field mb-3 min-h-20" value={itemNotes} maxLength={180} onChange={(event) => setItemNotes(event.target.value)} placeholder="Alguma observação? Ex.: sem cebola" /> : null}
          <AppActionButton className="w-full justify-between" onClick={addToCart}><span>Adicionar</span><span>{formatCurrency(selected.price * quantity)}</span></AppActionButton>
        </Sheet>
      ) : null}

      {panel === "cart" ? (
        <Sheet title="Seu carrinho" onClose={() => setPanel("none")}>
          {cart.length === 0 ? <p className="text-sm text-[hsl(var(--foreground-muted))]">O carrinho está vazio.</p> : null}
          <div className="space-y-2">
            {cart.map((line, index) => (
              <AppSurface key={`${line.menuItemId}-${line.notes}`} className="p-3">
                <div className="flex justify-between gap-2"><strong className="text-sm">{line.name}</strong><span className="text-sm">{formatCurrency(line.price * line.quantity)}</span></div>
                {line.notes ? <p className="mt-1 text-xs text-[hsl(var(--foreground-muted))]">Obs.: {line.notes}</p> : null}
                <div className="mt-2 flex items-center gap-3">
                  <AppActionButton variant="secondary" className="h-8 w-8 px-0" aria-label="Diminuir" onClick={() => changeLine(index, -1)}><Minus className="h-4 w-4" /></AppActionButton>
                  <span>{line.quantity}</span>
                  <AppActionButton variant="secondary" className="h-8 w-8 px-0" aria-label="Aumentar" onClick={() => changeLine(index, 1)}><Plus className="h-4 w-4" /></AppActionButton>
                </div>
              </AppSurface>
            ))}
          </div>
          {cart.length ? (
            <div className="mt-4 space-y-2">
              <div className="flex justify-between"><span>Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div>
              {access === "no_session" ? <p className="rounded-xl bg-[hsl(var(--warning)/0.12)] p-3 text-sm">A mesa ainda não foi aberta. Chame um atendente para abrir a mesa e passar o código; seu carrinho fica guardado.</p> : null}
              {access === "expired" ? <p className="rounded-xl bg-[hsl(var(--warning)/0.12)] p-3 text-sm">Os pedidos estão pausados. Peça ao atendente para renovar o atendimento.</p> : null}
              <AppActionButton className="w-full" disabled={access === "no_session" || access === "expired"} onClick={goToCheckout}>Continuar</AppActionButton>
              <AppActionButton variant="ghost" className="w-full" onClick={() => setCart([])}>Esvaziar carrinho</AppActionButton>
            </div>
          ) : null}
        </Sheet>
      ) : null}

      {panel === "code" ? (
        <Sheet title="Código da mesa" onClose={() => setPanel("none")}>
          <p className="mb-3 text-sm text-[hsl(var(--foreground-muted))]">Peça ao atendente o código de 6 dígitos desta mesa. Ele libera este celular para pedir.</p>
          {codeForm}
        </Sheet>
      ) : null}

      {panel === "checkout" ? (
        <Sheet title={lastOrder ? "Pedido enviado!" : "Finalizar pedido"} onClose={() => { setPanel("none"); setLastOrder(null); }}>
          {lastOrder ? (
            <div className="space-y-3 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-[hsl(var(--success))]" />
              <p className="text-lg">Pedido <strong className="font-mono">{lastOrder.code}</strong> recebido!</p>
              <p className="text-sm text-[hsl(var(--foreground-muted))]">{lastOrder.split ? "Os pratos foram para a cozinha e as bebidas já estão a caminho." : lastOrder.drinksOnly ? "Já está a caminho da sua mesa." : "Já está na cozinha. Avisamos aqui quando ficar pronto."}</p>
              <Link href={`/mesa/${encodeURIComponent(token)}/pedido/${lastOrder.id}`} className="block"><AppActionButton className="w-full">Acompanhar pedido</AppActionButton></Link>
              <AppActionButton variant="secondary" className="w-full" onClick={() => { setLastOrder(null); setPanel("none"); }}>Continuar pedindo</AppActionButton>
            </div>
          ) : (
            <div className="space-y-3">
              <AppSurface className="space-y-1 p-3 text-sm">
                {cart.map((line) => <div key={`${line.menuItemId}-${line.notes}`} className="flex justify-between gap-2"><span>{line.quantity}x {line.name}</span><span>{formatCurrency(line.price * line.quantity)}</span></div>)}
                <div className="flex justify-between border-t border-[hsl(var(--border))] pt-2"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                {serviceFee > 0 ? <div className="flex justify-between"><span>Taxa de serviço ({feePercent}%)</span><span>{formatCurrency(serviceFee)}</span></div> : null}
                <div className="flex justify-between text-base font-semibold"><span>Total</span><span>{formatCurrency(total)}</span></div>
              </AppSurface>
              <input className="app-field" maxLength={80} value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder={loaded.settings.requireCustomerName ? "Seu nome (obrigatório)" : "Seu nome (opcional)"} />
              {loaded.settings.allowCustomerNotes ? <textarea className="app-field min-h-16" maxLength={500} value={orderNotes} onChange={(event) => setOrderNotes(event.target.value)} placeholder="Observação para o pedido (opcional)" /> : null}
              <label className="block text-sm">Forma de pagamento
                <select className="app-field mt-1" value={paymentMethod} onChange={(event) => { setPaymentMethod(event.target.value as PaymentMethod); setChangeFor(""); }}>
                  {acceptedMethods.map((method) => <option key={method} value={method}>{PAYMENT_LABELS[method]}</option>)}
                </select>
              </label>
              <label className="block text-sm">Como vai pagar
                <select className="app-field mt-1" value={paymentMode} onChange={(event) => setPaymentMode(event.target.value as PaymentMode)}>
                  <option value="counter">No caixa, ao sair</option>
                  <option value="waiter">Com o garçom, na mesa</option>
                  <option value="system_simulated">Pelo sistema (demonstração)</option>
                </select>
              </label>
              {paymentMethod === "cash" ? <input className="app-field" inputMode="decimal" value={changeFor} onChange={(event) => setChangeFor(event.target.value)} placeholder="Troco para quanto? (opcional)" /> : null}
              {paymentMode === "system_simulated" ? <p className="rounded-xl bg-[hsl(var(--surface-muted))] p-3 text-xs">Demonstração acadêmica: nenhum pagamento real é feito.{paymentMethod === "pix" && loaded.settings.pixKey ? ` Chave PIX: ${loaded.settings.pixKey}.` : ""}</p> : null}
              {feedback ? <p className="text-sm text-[hsl(var(--danger))]">{feedback}</p> : null}
              <AppActionButton className="w-full gap-2" disabled={submitting || cart.length === 0} onClick={() => void submitOrder()}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Enviar pedido · {formatCurrency(total)}</AppActionButton>
              <p className="text-center text-xs text-[hsl(var(--foreground-muted))]">Os preços são conferidos pelo restaurante ao receber o pedido.</p>
            </div>
          )}
        </Sheet>
      ) : null}

      {panel === "orders" ? (
        <Sheet title="Pedidos da mesa" onClose={() => setPanel("none")}>
          {orders.length === 0 ? <p className="text-sm text-[hsl(var(--foreground-muted))]">Nenhum pedido ainda.</p> : null}
          <div className="space-y-2">
            {orders.map((order) => (
              <Link key={order.id} href={`/mesa/${encodeURIComponent(token)}/pedido/${order.id}`} className="block">
                <AppSurface className="space-y-1 p-3">
                  <div className="flex items-center justify-between gap-2"><span className="font-mono text-sm font-semibold">{order.orderCode}</span><AppStatusBadge tone={ORDER_TONE[order.status] ?? "info"}>{customerStatusLabel(order.status, order.station)}</AppStatusBadge></div>
                  <p className="text-sm text-[hsl(var(--foreground-muted))]">{order.items.map((item) => `${item.quantity}x ${item.nameSnapshot}`).join(", ")}</p>
                  <p className="text-sm font-semibold">{formatCurrency(order.total)}</p>
                </AppSurface>
              </Link>
            ))}
          </div>
          {orders.length ? <p className="mt-3 text-sm">Total da mesa: <strong>{formatCurrency(orders.filter((order) => order.status !== "cancelled").reduce((sum, order) => sum + order.total, 0))}</strong></p> : null}
        </Sheet>
      ) : null}

      {panel === "waiter" ? (
        <Sheet title="Chamar garçom" onClose={() => setPanel("none")}>
          <div className="grid gap-2">
            {WAITER_REASONS.filter((reason) => reason !== "fazer pagamento" || loaded.settings.billRequestEnabled).map((reason) => (
              <label key={reason} className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${waiterReason === reason ? "border-[hsl(var(--primary))]" : "border-[hsl(var(--border-strong))]"}`}>
                <input type="radio" name="waiter-reason" checked={waiterReason === reason} onChange={() => setWaiterReason(reason)} />
                {reason === "fazer pagamento" ? "Pedir a conta" : reason.charAt(0).toUpperCase() + reason.slice(1)}
              </label>
            ))}
          </div>
          <AppActionButton className="mt-3 w-full gap-2" onClick={() => void callWaiter()}><Bell className="h-4 w-4" />Chamar</AppActionButton>
        </Sheet>
      ) : null}
    </main>
  );
}
