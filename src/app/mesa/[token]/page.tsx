"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, CheckCircle2, ChefHat, ChevronRight, Clock3, HandPlatter, KeyRound, Loader2, MessageSquarePlus, Minus, Plus, ReceiptText, RefreshCw, Search, ShoppingBag, Sparkles, X } from "lucide-react";

import { AppActionButton, AppSearchInput, AppSkeleton, AppStatusBadge, AppSurface, MobileStickyBar } from "@/components/ui/app-design-system";
import { categoryIcon } from "@/lib/utils/category-icon";
import { customerStatusLabel } from "@/lib/utils/customer-order-status";
import type { CartItem, PaymentMethod, PublicMenuItem, PublicOrder, PublicTableData } from "@/lib/types/domain";
import { randomKey, readStored, storageKeys, writeStored } from "@/lib/utils/customer-storage";
import { cn } from "@/lib/utils/cn";
import { describeOrderItem, groupRuleLabel, resolveChoices } from "@/lib/utils/menu-options";
import { formatCurrency } from "@/lib/utils/formatters";

type LoadState = { kind: "loading" } | { kind: "error"; title: string; message: string } | { kind: "ready"; data: PublicTableData };
type Panel = "none" | "cart" | "sent" | "orders" | "waiter" | "code";

const PAYMENT_LABELS: Record<string, string> = { pix: "PIX", cash: "Dinheiro", debit_card: "Débito", credit_card: "Crédito" };
const CUSTOMER_METHODS = ["pix", "cash", "debit_card", "credit_card"] as const;
const WAITER_REASONS = [
  { value: "pedir ajuda", label: "Preciso de ajuda" },
  { value: "solicitar talheres", label: "Talheres, guardanapo ou copo" },
  { value: "outra necessidade", label: "Outra coisa" }
] as const;
const ORDER_TONE: Record<string, "info" | "warning" | "success" | "neutral" | "danger"> = { received: "warning", confirmed: "warning", in_preparation: "warning", ready: "success", delivered: "neutral", cancelled: "danger" };
const OPEN = new Set(["received", "confirmed", "in_preparation", "ready"]);

function ItemImage({ item, size = 96, emoji = "🍽️" }: { item: PublicMenuItem; size?: number; emoji?: string }): JSX.Element {
  if (item.imageUrl) return <Image src={item.imageUrl} alt={item.name} width={size} height={size} className="h-full w-full object-cover" unoptimized />;
  return <div className="flex h-full w-full items-center justify-center bg-[hsl(var(--primary-soft))] text-4xl" aria-hidden="true">{emoji}</div>;
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[hsl(var(--background-elevated))] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-xl">{title}</h2><button type="button" onClick={onClose} aria-label="Fechar" className="rounded-full p-2 hover:bg-[hsl(var(--surface-muted))]"><X className="h-5 w-5" /></button></div>
        {children}
      </div>
    </div>
  );
}

export default function PublicMesaPage(): JSX.Element {
  const params = useParams<{ token: string }>();
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
  const [choices, setChoices] = useState<Record<string, string[]>>({});
  const [choiceError, setChoiceError] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [panel, setPanel] = useState<Panel>("none");
  const [customerName, setCustomerName] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [showOrderNotes, setShowOrderNotes] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [changeFor, setChangeFor] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [lastOrder, setLastOrder] = useState<{ id: string; code: string; split: boolean; drinksOnly: boolean } | null>(null);
  const [orders, setOrders] = useState<PublicOrder[]>([]);
  const [calling, setCalling] = useState(false);
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

  const activeOrders = orders.filter((order) => OPEN.has(order.status));
  useEffect(() => {
    if (access !== "authorized" && orders.length === 0) return;
    void fetchOrders();
    // Faster while something is on the way, so "Pronto, já vai" shows up quickly.
    const id = window.setInterval(() => void fetchOrders(), panel === "orders" || activeOrders.length ? 10_000 : 30_000);
    return () => window.clearInterval(id);
  }, [access, fetchOrders, orders.length, panel, activeOrders.length]);

  // Drop cart lines that left the menu and refresh prices.
  useEffect(() => {
    if (!data) return;
    const byId = new Map(data.items.map((item) => [item.id, item]));
    setCart((current) => {
      // Prices come from the menu again (options included); a line whose options no longer exist is dropped.
      const next = current.flatMap((line) => {
        const item = byId.get(line.menuItemId);
        if (!item) return [];
        const resolved = resolveChoices(item.optionGroups ?? [], line.options);
        if ("error" in resolved) return [];
        return [{ ...line, name: item.name, price: Math.round((item.price + resolved.extra) * 100) / 100 }];
      });
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
  const emojiByCategory = useMemo(() => new Map((data?.categories ?? []).map((item) => [item.id, categoryIcon(item.name)])), [data?.categories]);
  const emojiFor = (item: PublicMenuItem) => emojiByCategory.get(item.categoryId) ?? "🍽️";
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = Math.round(cart.reduce((sum, item) => sum + item.quantity * item.price, 0) * 100) / 100;
  const feePercent = data?.settings.serviceFeePercent ?? 0;
  const serviceFee = Math.round(subtotal * feePercent) / 100;
  const total = Math.round((subtotal + serviceFee) * 100) / 100;
  const tableTotal = orders.filter((order) => order.status !== "cancelled").reduce((sum, order) => sum + order.total, 0);
  const inCart = (id: string) => cart.filter((line) => line.menuItemId === id).reduce((sum, line) => sum + line.quantity, 0);

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
    setPanel(cart.length ? "cart" : "code");
    void fetchTable(true);
  }

  function addLine(item: PublicMenuItem, count: number, notes: string, picked: Array<{ groupId: string; optionId: string }> = []): boolean {
    const resolved = resolveChoices(item.optionGroups ?? [], picked);
    if ("error" in resolved) return false;
    const key = picked.map((choice) => `${choice.groupId}:${choice.optionId}`).sort().join("|");
    const optionsLabel = resolved.options.map((option) => option.name).join(", ");
    const price = Math.round((item.price + resolved.extra) * 100) / 100;
    setCart((current) => {
      const sameKey = (line: CartItem) => (line.options ?? []).map((choice) => `${choice.groupId}:${choice.optionId}`).sort().join("|") === key;
      const found = current.find((line) => line.menuItemId === item.id && line.notes === notes && sameKey(line));
      if (found) return current.map((line) => (line === found ? { ...line, quantity: Math.min(20, line.quantity + count) } : line));
      return [...current, { menuItemId: item.id, name: item.name, price, quantity: count, notes, imageUrl: item.imageUrl, options: picked, optionsLabel }];
    });
    return true;
  }

  function openItem(item: PublicMenuItem): void {
    setSelected(item);
    setQuantity(1);
    setItemNotes("");
    setChoiceError("");
    // Single-choice required groups start with the first option chosen: one tap less.
    setChoices(Object.fromEntries((item.optionGroups ?? []).map((group) => [group.id, group.min === 1 && group.max === 1 ? [group.options[0].id] : []])));
  }

  function toggleChoice(groupId: string, optionId: string, max: number): void {
    setChoiceError("");
    setChoices((current) => {
      const chosen = current[groupId] ?? [];
      if (chosen.includes(optionId)) return { ...current, [groupId]: chosen.filter((id) => id !== optionId) };
      if (max === 1) return { ...current, [groupId]: [optionId] };
      if (chosen.length >= max) return current;
      return { ...current, [groupId]: [...chosen, optionId] };
    });
  }

  function addFromSheet(): void {
    if (!selected) return;
    const picked = Object.entries(choices).flatMap(([groupId, ids]) => ids.map((optionId) => ({ groupId, optionId })));
    const resolved = resolveChoices(selected.optionGroups ?? [], picked);
    if ("error" in resolved) { setChoiceError(resolved.group ? `Escolha em "${resolved.group}".` : "Revise as escolhas."); return; }
    addLine(selected, quantity, itemNotes.trim(), picked);
    setSelected(null);
    setNotice(`${quantity}x ${selected.name} no carrinho`);
  }

  const sheetExtra = (() => {
    if (!selected) return 0;
    const picked = Object.entries(choices).flatMap(([groupId, ids]) => ids.map((optionId) => ({ groupId, optionId })));
    return (selected.optionGroups ?? []).reduce((sum, group) => sum + group.options.filter((option) => picked.some((choice) => choice.groupId === group.id && choice.optionId === option.id)).reduce((acc, option) => acc + option.price, 0), 0);
  })();

  function changeLine(index: number, delta: number): void {
    setCart((current) => current.map((line, position) => (position === index ? { ...line, quantity: Math.min(20, line.quantity + delta) } : line)).filter((line) => line.quantity > 0));
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
          items: cart.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity, notes: line.notes || null, ...(line.options?.length ? { options: line.options } : {}) })),
          customerName: customerName.trim() || null,
          notes: orderNotes.trim() || null,
          paymentMethod,
          // Payment happens at the cashier when the bill is closed.
          paymentMode: "counter",
          changeFor: paymentMethod === "cash" ? change : null
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) { writeStored(storageKeys.attempt(token), null); requireCode("Para enviar o pedido, digite o código da mesa."); return; }
      if (!response.ok) {
        if (payload.code === "idempotency_conflict" && !retry) { writeStored(storageKeys.attempt(token), null); await submitOrder(true); return; }
        if (response.status < 500) writeStored(storageKeys.attempt(token), null);
        setFeedback(payload.error ?? "Não foi possível enviar o pedido.");
        // Something sold out or changed: reload the menu so the cart drops/reprices it.
        if (payload.code === "item_unavailable" || payload.code === "option_invalid") void fetchTable(true);
        if (["session_expired", "no_session", "session_inactive"].includes(payload.code)) void fetchTable(true);
        return;
      }
      writeStored(storageKeys.attempt(token), null);
      const parts = Array.isArray(payload.orders) ? payload.orders as Array<{ station: string }> : [];
      setLastOrder({ id: payload.orderId, code: payload.groupCode ?? payload.orderCode, split: parts.length > 1, drinksOnly: parts.length === 1 && parts[0].station === "ready" });
      setCart([]);
      setOrderNotes("");
      setShowOrderNotes(false);
      setChangeFor("");
      setPanel("sent");
      void fetchOrders();
    } catch {
      setFeedback("A conexão caiu. Toque em enviar de novo: o pedido não será duplicado.");
    } finally {
      setSubmitting(false);
    }
  }

  async function callWaiter(reason: string): Promise<void> {
    if (calling) return;
    setCalling(true);
    try {
      const response = await fetch("/api/public/waiter-call", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify({ reason }) });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) { requireCode("Para chamar o garçom pelo celular, digite o código da mesa."); return; }
      if (response.ok) setNotice(reason === "fazer pagamento" ? `Pedido de conta enviado. Total até agora: ${formatCurrency(tableTotal)}.` : "Chamado enviado. Um atendente já vem até a mesa.");
      else setNotice(payload.error ?? "Não foi possível chamar o garçom.");
      if (response.ok || response.status === 409) setPanel("none");
    } catch {
      setNotice("Sem conexão para chamar o garçom. Chame um atendente pessoalmente.");
    } finally {
      setCalling(false);
    }
  }

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(id);
  }, [notice]);

  const codeForm = (
    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void authorize().then((ok) => { if (ok && panel === "code") setPanel("none"); }); }}>
      <input className="app-field num h-14 text-center text-3xl font-bold tracking-[0.45em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" aria-label="Código de 6 dígitos" />
      {codeError ? <p className="text-sm text-[hsl(var(--danger))]">{codeError}</p> : null}
      <AppActionButton type="submit" className="h-12 w-full gap-2" disabled={code.length !== 6 || authorizing}>{authorizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Liberar este celular</AppActionButton>
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
  const canOrder = access === "authorized";
  return (
    <main className="min-h-screen bg-[hsl(var(--background))] px-3 pb-32 pt-4 text-[hsl(var(--foreground))]">
      <section className="mx-auto flex w-full max-w-md flex-col gap-4">
        <AppSurface variant="strong" className="overflow-hidden p-0">
          <div className="flex items-start justify-between gap-3 bg-[hsl(var(--primary))] px-4 py-4 text-[hsl(var(--primary-foreground))]">
            <div className="min-w-0"><h1 className="truncate text-2xl">{loaded.restaurantName ?? "Cardápio"}</h1><p className="text-sm opacity-90">{loaded.table.label}</p></div>
            <span className="shrink-0 rounded-full bg-[hsl(var(--primary-foreground)/0.16)] px-3 py-1 text-xs font-semibold">{canOrder ? "Pedidos liberados" : access === "needs_code" ? "Mesa aberta" : access === "expired" ? "Pausado" : "Só cardápio"}</span>
          </div>
          <div className="px-4 pb-4 empty:hidden">
            {access === "no_session" ? (
              <div className="mt-3 space-y-2 text-sm">
                <p>Esta mesa ainda não foi aberta. Você já pode olhar o cardápio e montar o carrinho; chame um atendente para abrir a mesa.</p>
                <AppActionButton variant="secondary" className="gap-2" disabled={refreshing} onClick={() => void fetchTable(true)}>{refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Já abriram? Atualizar</AppActionButton>
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
            {canOrder && loaded.settings.allowWaiterCall ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <AppActionButton variant="secondary" className="gap-2" onClick={() => setPanel("waiter")}><Bell className="h-4 w-4" />Chamar garçom</AppActionButton>
                {loaded.settings.billRequestEnabled ? <AppActionButton variant="secondary" className="gap-2" disabled={calling} onClick={() => void callWaiter("fazer pagamento")}><ReceiptText className="h-4 w-4" />Pedir a conta</AppActionButton> : null}
              </div>
            ) : null}
          </div>
        </AppSurface>

        {activeOrders.length ? (
          <button type="button" onClick={() => setPanel("orders")} className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-3 text-left">
            <span className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", activeOrders.some((order) => order.status === "ready") ? "bg-[hsl(var(--success)/0.14)] text-[hsl(var(--success))]" : "bg-[hsl(var(--gema)/0.2)] text-[hsl(var(--warning))]")}>{activeOrders.some((order) => order.status === "ready") ? <HandPlatter className="h-5 w-5" /> : <ChefHat className="h-5 w-5" />}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Seus pedidos</span>
              <span className="block truncate text-sm text-[hsl(var(--foreground-muted))]">{activeOrders.map((order) => customerStatusLabel(order.status, order.station)).filter((label, index, list) => list.indexOf(label) === index).join(" · ")}</span>
            </span>
            <ChevronRight className="h-5 w-5 text-[hsl(var(--foreground-muted))]" />
          </button>
        ) : null}

        <AppSurface className="sticky top-2 z-20 space-y-3 p-3">
          <AppSearchInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar no cardápio" />
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            <AppActionButton variant={category === "all" ? "primary" : "secondary"} className="h-10 shrink-0 rounded-full" onClick={() => setCategory("all")}>Todos</AppActionButton>
            {loaded.categories.map((item) => <AppActionButton key={item.id} variant={category === item.id ? "primary" : "secondary"} className="h-10 shrink-0 gap-1.5 rounded-full" onClick={() => setCategory(item.id)}><span aria-hidden="true">{categoryIcon(item.name)}</span>{item.name}</AppActionButton>)}
          </div>
        </AppSurface>

        {category === "all" && !search && featured.length ? (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {featured.map((item) => (
              <button key={item.id} type="button" onClick={() => openItem(item)} className="w-40 shrink-0 overflow-hidden rounded-2xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--background-elevated))] text-left">
                <div className="h-24 w-full"><ItemImage item={item} size={160} emoji={emojiFor(item)} /></div>
                <div className="p-2"><p className="flex items-center gap-1 text-xs font-medium text-[hsl(var(--warning))]"><Sparkles className="h-3 w-3" />Destaque</p><p className="line-clamp-1 text-sm font-semibold">{item.name}</p><p className="num text-sm">{formatCurrency(item.price)}</p></div>
              </button>
            ))}
          </div>
        ) : null}

        {loaded.items.length === 0 ? <AppSurface className="p-5 text-center text-sm text-[hsl(var(--foreground-muted))]">O cardápio ainda está sendo preparado. Chame um atendente.</AppSurface> : null}
        {loaded.items.length > 0 && items.length === 0 ? <AppSurface className="p-5 text-center text-sm text-[hsl(var(--foreground-muted))]"><Search className="mx-auto mb-2 h-5 w-5" />Nada encontrado.</AppSurface> : null}
        <div className="space-y-3">
          {items.map((item) => {
            const count = inCart(item.id);
            return (
              <AppSurface key={item.id} className={cn("relative overflow-hidden p-0", count ? "border-[hsl(var(--primary)/0.5)]" : "")}>
                <button type="button" className="flex w-full gap-3 p-3 pr-16 text-left" onClick={() => openItem(item)}>
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl"><ItemImage item={item} emoji={emojiFor(item)} /></div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <h2 className="text-base leading-tight">{item.dailySpecial ? <span className="mr-1.5 inline-block rounded-full bg-[hsl(var(--gema))] px-2 py-0.5 align-middle text-xs font-bold text-[hsl(217_28%_15%)]">Hoje</span> : null}{item.name}</h2>
                    {item.description ? <p className="line-clamp-2 text-xs text-[hsl(var(--foreground-muted))]">{item.description}</p> : null}
                    <div className="flex items-center gap-3 pt-1 text-sm"><strong className="num text-[hsl(var(--primary))]">{formatCurrency(item.price)}</strong>{item.preparationTimeMinutes ? <span className="inline-flex items-center gap-1 text-xs text-[hsl(var(--foreground-muted))]"><Clock3 className="h-3 w-3" />{item.preparationTimeMinutes} min</span> : null}</div>
                  </div>
                </button>
                {/* One tap adds one; tapping the card opens quantity and notes. */}
                <button type="button" aria-label={`Adicionar ${item.name}`} onClick={() => { if ((item.optionGroups ?? []).some((group) => group.min > 0)) { openItem(item); return; } addLine(item, 1, ""); setNotice(`${item.name} no carrinho`); }} className="absolute bottom-3 right-3 inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-full bg-[hsl(var(--primary))] px-3 text-sm font-bold text-[hsl(var(--primary-foreground))] shadow-md">
                  {count ? <span className="num">{count}</span> : null}<Plus className="h-5 w-5" />
                </button>
              </AppSurface>
            );
          })}
        </div>
      </section>

      {notice ? <div className="fixed inset-x-3 top-3 z-[80] mx-auto max-w-md rounded-2xl bg-[hsl(var(--foreground))] px-4 py-3 text-sm text-[hsl(var(--background))] shadow-lg" role="status">{notice}</div> : null}

      {cartCount > 0 ? (
        <MobileStickyBar className="fixed inset-x-3 bottom-3 z-30 w-auto p-2">
          <button type="button" onClick={() => { setFeedback(""); setPanel("cart"); }} className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[hsl(var(--primary))] px-4 py-3 text-[hsl(var(--primary-foreground))]">
            <span className="flex items-center gap-2 font-semibold"><ShoppingBag className="h-5 w-5" />Ver pedido <span className="num rounded-full bg-[hsl(var(--primary-foreground)/0.2)] px-2 text-sm">{cartCount}</span></span>
            <span className="num font-bold">{formatCurrency(total)}</span>
          </button>
        </MobileStickyBar>
      ) : null}

      {selected ? (
        <Sheet title={selected.name} onClose={() => setSelected(null)}>
          {selected.imageUrl ? <div className="mb-3 h-48 overflow-hidden rounded-2xl"><ItemImage item={selected} size={400} /></div> : null}
          {selected.description ? <p className="mb-3 text-sm text-[hsl(var(--foreground-muted))]">{selected.description}</p> : null}
          <div className="mb-3 flex items-center justify-between">
            <strong className="num">{formatCurrency(selected.price)}</strong>
            <div className="flex items-center gap-3">
              <AppActionButton variant="secondary" className="h-10 w-10 px-0" aria-label="Diminuir" onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus className="h-4 w-4" /></AppActionButton>
              <span className="num w-6 text-center text-lg">{quantity}</span>
              <AppActionButton variant="secondary" className="h-10 w-10 px-0" aria-label="Aumentar" onClick={() => setQuantity(Math.min(20, quantity + 1))}><Plus className="h-4 w-4" /></AppActionButton>
            </div>
          </div>
          {(selected.optionGroups ?? []).map((group) => (
            <fieldset key={group.id} className="mb-4 space-y-2">
              <legend className="flex w-full items-center justify-between gap-2 pb-1"><span className="font-semibold">{group.name}</span><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", group.min > 0 ? "bg-[hsl(var(--gema)/0.22)] text-[hsl(var(--warning))]" : "bg-[hsl(var(--surface-muted))] text-[hsl(var(--foreground-muted))]")}>{groupRuleLabel(group)}</span></legend>
              <div className="grid gap-1.5">
                {group.options.map((option) => {
                  const active = (choices[group.id] ?? []).includes(option.id);
                  return (
                    <button key={option.id} type="button" role={group.max === 1 ? "radio" : "checkbox"} aria-checked={active} onClick={() => toggleChoice(group.id, option.id, group.max)} className={cn("flex min-h-11 items-center justify-between gap-3 rounded-[var(--radius-md)] border px-3 py-2 text-left text-sm", active ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary-soft))] font-semibold" : "border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))]")}>
                      <span className="flex items-center gap-2"><span className={cn("inline-flex h-5 w-5 shrink-0 items-center justify-center border-2", group.max === 1 ? "rounded-full" : "rounded-md", active ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]" : "border-[hsl(var(--border-strong))]")}>{active ? <span className={cn("bg-white", group.max === 1 ? "h-2 w-2 rounded-full" : "h-2.5 w-2.5 rounded-sm")} /> : null}</span>{option.name}</span>
                      {option.price > 0 ? <span className="num shrink-0 text-[hsl(var(--foreground-muted))]">+{formatCurrency(option.price)}</span> : null}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
          {choiceError ? <p className="mb-2 text-sm text-[hsl(var(--danger))]">{choiceError}</p> : null}
          {loaded.settings.allowCustomerNotes ? <textarea className="app-field mb-3 min-h-20 py-2" value={itemNotes} maxLength={180} onChange={(event) => setItemNotes(event.target.value)} placeholder="Alguma observação? Ex.: sem cebola" /> : null}
          <AppActionButton className="h-12 w-full justify-between text-base" onClick={addFromSheet}><span>Adicionar</span><span className="num">{formatCurrency((selected.price + sheetExtra) * quantity)}</span></AppActionButton>
        </Sheet>
      ) : null}

      {panel === "cart" ? (
        <Sheet title="Seu pedido" onClose={() => setPanel("none")}>
          {cart.length === 0 ? <p className="text-sm text-[hsl(var(--foreground-muted))]">O carrinho está vazio.</p> : (
            <div className="space-y-4">
              <ul className="divide-y divide-[hsl(var(--border))]">
                {cart.map((line, index) => (
                  <li key={`${line.menuItemId}-${line.notes}-${line.optionsLabel ?? ""}`} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{line.name}</p>
                      {line.optionsLabel ? <p className="text-xs text-[hsl(var(--primary))]">{line.optionsLabel}</p> : null}
                      {line.notes ? <p className="text-xs text-[hsl(var(--foreground-muted))]">{line.notes}</p> : null}
                      <p className="num text-sm text-[hsl(var(--foreground-muted))]">{formatCurrency(line.price * line.quantity)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <AppActionButton variant="secondary" className="h-9 w-9 px-0" aria-label="Diminuir" onClick={() => changeLine(index, -1)}><Minus className="h-4 w-4" /></AppActionButton>
                      <span className="num w-7 text-center">{line.quantity}</span>
                      <AppActionButton variant="secondary" className="h-9 w-9 px-0" aria-label="Aumentar" onClick={() => changeLine(index, 1)}><Plus className="h-4 w-4" /></AppActionButton>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="space-y-1 rounded-[var(--radius-md)] bg-[hsl(var(--surface-muted))] p-3 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span className="num">{formatCurrency(subtotal)}</span></div>
                {serviceFee > 0 ? <div className="flex justify-between"><span>Taxa de serviço ({feePercent}%)</span><span className="num">{formatCurrency(serviceFee)}</span></div> : null}
                <div className="flex justify-between text-base font-semibold"><span>Total</span><span className="num">{formatCurrency(total)}</span></div>
              </div>

              {access === "no_session" ? <p className="rounded-xl bg-[hsl(var(--gema)/0.15)] p-3 text-sm">A mesa ainda não foi aberta. Chame um atendente para abrir e passar o código; seu carrinho fica guardado.</p> : null}
              {access === "expired" ? <p className="rounded-xl bg-[hsl(var(--gema)/0.15)] p-3 text-sm">Os pedidos estão pausados. Peça ao atendente para renovar o atendimento.</p> : null}

              {access === "needs_code" ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Digite o código da mesa para enviar</p>
                  {codeForm}
                </div>
              ) : null}

              {canOrder ? (
                <>
                  {loaded.settings.requireCustomerName ? <input className="app-field" maxLength={80} value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Seu nome" /> : null}
                  {acceptedMethods.length > 1 ? (
                    <div className="space-y-1.5">
                      <p className="text-sm">Vai pagar no caixa com</p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {acceptedMethods.map((method) => (
                          <button key={method} type="button" onClick={() => { setPaymentMethod(method); setChangeFor(""); }} className={cn("h-10 rounded-[var(--radius-md)] border text-sm font-semibold", paymentMethod === method ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary-soft))] text-[hsl(var(--primary))]" : "border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))]")}>{PAYMENT_LABELS[method]}</button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {paymentMethod === "cash" ? <input className="app-field" inputMode="decimal" value={changeFor} onChange={(event) => setChangeFor(event.target.value)} placeholder="Troco para quanto? (opcional)" /> : null}
                  {paymentMethod === "pix" && loaded.settings.pixKey ? <p className="text-xs text-[hsl(var(--foreground-muted))]">Chave PIX do restaurante: <span className="font-semibold">{loaded.settings.pixKey}</span></p> : null}
                  {loaded.settings.allowCustomerNotes ? (showOrderNotes
                    ? <textarea className="app-field min-h-16 py-2" maxLength={500} value={orderNotes} onChange={(event) => setOrderNotes(event.target.value)} placeholder="Observação para o pedido" />
                    : <button type="button" onClick={() => setShowOrderNotes(true)} className="inline-flex items-center gap-1 text-sm text-[hsl(var(--primary))]"><MessageSquarePlus className="h-4 w-4" />Observação para o pedido</button>) : null}
                  {feedback ? <p className="text-sm text-[hsl(var(--danger))]">{feedback}</p> : null}
                  <AppActionButton className="h-14 w-full justify-between px-5 text-base" disabled={submitting} onClick={() => void submitOrder()}>
                    <span className="flex items-center gap-2">{submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}Enviar pedido</span>
                    <span className="num">{formatCurrency(total)}</span>
                  </AppActionButton>
                </>
              ) : null}
              <button type="button" className="w-full text-center text-sm text-[hsl(var(--foreground-muted))]" onClick={() => { setCart([]); setPanel("none"); }}>Esvaziar carrinho</button>
            </div>
          )}
        </Sheet>
      ) : null}

      {panel === "code" ? (
        <Sheet title="Código da mesa" onClose={() => setPanel("none")}>
          <p className="mb-3 text-sm text-[hsl(var(--foreground-muted))]">Peça ao atendente o código de 6 dígitos desta mesa. Ele libera este celular para pedir.</p>
          {codeForm}
        </Sheet>
      ) : null}

      {panel === "sent" && lastOrder ? (
        <Sheet title="Pedido enviado!" onClose={() => { setPanel("none"); setLastOrder(null); }}>
          <div className="space-y-3 text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-[hsl(var(--success))]" />
            <p className="text-lg">Pedido <strong className="num">{lastOrder.code}</strong> recebido!</p>
            <p className="text-sm text-[hsl(var(--foreground-muted))]">{lastOrder.split ? "Os pratos foram para a cozinha e as bebidas já estão a caminho." : lastOrder.drinksOnly ? "Já está a caminho da sua mesa." : "Já está na cozinha. Você acompanha aqui quando ficar pronto."}</p>
            <AppActionButton className="h-12 w-full" onClick={() => { setLastOrder(null); setPanel("none"); }}>Continuar pedindo</AppActionButton>
            <Link href={`/mesa/${encodeURIComponent(token)}/pedido/${lastOrder.id}`} className="block text-sm font-medium text-[hsl(var(--primary))]">Acompanhar este pedido</Link>
          </div>
        </Sheet>
      ) : null}

      {panel === "orders" ? (
        <Sheet title="Pedidos da mesa" onClose={() => setPanel("none")}>
          {orders.length === 0 ? <p className="text-sm text-[hsl(var(--foreground-muted))]">Nenhum pedido ainda.</p> : null}
          <div className="space-y-2">
            {orders.map((order) => (
              <Link key={order.id} href={`/mesa/${encodeURIComponent(token)}/pedido/${order.id}`} className="block">
                <AppSurface className="space-y-1 p-3">
                  <div className="flex items-center justify-between gap-2"><span className="num text-sm font-semibold">{order.orderCode}</span><AppStatusBadge tone={ORDER_TONE[order.status] ?? "info"}>{customerStatusLabel(order.status, order.station)}</AppStatusBadge></div>
                  <p className="text-sm text-[hsl(var(--foreground-muted))]">{order.items.map(describeOrderItem).join(", ")}</p>
                  <p className="num text-sm font-semibold">{formatCurrency(order.total)}</p>
                </AppSurface>
              </Link>
            ))}
          </div>
          {orders.length ? <p className="mt-3 text-sm">Total da mesa: <strong className="num">{formatCurrency(tableTotal)}</strong></p> : null}
          {orders.length && canOrder && loaded.settings.billRequestEnabled && loaded.settings.allowWaiterCall ? <AppActionButton variant="secondary" className="mt-3 w-full gap-2" disabled={calling} onClick={() => void callWaiter("fazer pagamento")}><ReceiptText className="h-4 w-4" />Pedir a conta</AppActionButton> : null}
        </Sheet>
      ) : null}

      {panel === "waiter" ? (
        <Sheet title="Chamar garçom" onClose={() => setPanel("none")}>
          <div className="grid gap-2">
            {WAITER_REASONS.map((reason) => (
              <AppActionButton key={reason.value} variant="secondary" className="h-12 justify-start gap-2 text-base" disabled={calling} onClick={() => void callWaiter(reason.value)}><Bell className="h-4 w-4" />{reason.label}</AppActionButton>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-[hsl(var(--foreground-muted))]">Toque no motivo e o garçom é avisado na hora.</p>
        </Sheet>
      ) : null}
    </main>
  );
}
