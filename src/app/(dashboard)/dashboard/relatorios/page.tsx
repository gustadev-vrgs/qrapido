"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Printer, RefreshCw } from "lucide-react";

import { ExportMenu, Kpi, ReportBlock, RevenueChart, ShareList } from "@/components/reports/report-parts";
import { AppEmptyState, AppSelect, AppSkeleton, AppTextInput } from "@/components/ui/app-design-system";
import { MenuService } from "@/lib/data/services/menu-service";
import { OrdersService } from "@/lib/data/services/orders-service";
import { ReportsService } from "@/lib/data/services/reports-service";
import { SessionsService } from "@/lib/data/services/sessions-service";
import { RestaurantsService } from "@/lib/data/services/restaurants-service";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import { describeFirebaseError } from "@/lib/data/errors";
import { toRestaurantDateKey } from "@/lib/utils/date-key";
import type { MenuCategory, MenuItem, Order, OrderEvent, Restaurant, TableSession } from "@/lib/types/domain";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils/formatters";
import { calculateSummary, compareValues, filterOrdersByPeriod, filterSessionsByPeriod, getOrderDate, getPreviousPeriod, groupCategories, groupPayments, groupProducts, groupTables, isBillableOrder, isCancelledOrder, resolveReportPeriod, sessionDurationMinutes, toDateKey, type PeriodPreset } from "@/lib/utils/report-calculations";
import { cn } from "@/lib/utils/cn";
import { sessionStatusLabels } from "@/lib/constants/status-labels";

const STATUS_LABELS: Record<Order["status"], string> = { received: "Recebido", confirmed: "Confirmado", in_preparation: "Em preparo", ready: "Pronto", delivered: "Entregue", cancelled: "Cancelado" };
const PAYMENT_LABELS: Record<string, string> = { pix: "Pix", cash: "Dinheiro", debit_card: "Débito", credit_card: "Crédito", card_on_counter: "Cartão no balcão", card_on_table: "Cartão na mesa", other: "Outras" };
const SESSION_FILTERS = { all: "Todas", open: "Abertas", closed: "Encerradas" } as const;
const REPORT_TABS = ["Resumo", "Produtos", "Pedidos", "Mesas"] as const;
const PERIODS: Array<{ value: PeriodPreset; label: string }> = [{ value: "today", label: "Hoje" }, { value: "yesterday", label: "Ontem" }, { value: "last7", label: "7 dias" }, { value: "last30", label: "30 dias" }, { value: "currentMonth", label: "Este mês" }, { value: "previousMonth", label: "Mês passado" }, { value: "custom", label: "Escolher datas" }];
const EXPORTS: Array<{ value: ExportKind; label: string }> = [{ value: "resumo", label: "Resumo" }, { value: "pedidos", label: "Pedidos" }, { value: "produtos", label: "Produtos" }, { value: "categorias", label: "Categorias" }, { value: "pagamentos", label: "Pagamentos" }, { value: "mesas", label: "Mesas" }, { value: "atendimentos", label: "Atendimentos" }];

type Tab = (typeof REPORT_TABS)[number];
type SessionFilter = keyof typeof SESSION_FILTERS;
type ExportKind = "resumo" | "pedidos" | "produtos" | "categorias" | "pagamentos" | "mesas" | "atendimentos";

type SortOrders = "recent" | "old" | "highest" | "lowest";
type SortTables = "revenue" | "attendances" | "orders" | "duration";

function isoLocalInput(date: Date): string { return toRestaurantDateKey(date); }
function periodLabel(start: Date, end: Date): string { const a = formatDate(start); const b = formatDate(end); return a === b ? a : `${a} a ${b}`; }
function csvEscape(value: string | number): string { const text = String(value); const safe = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text; return `"${safe.replaceAll('"', '""')}"`; }
function downloadCsv(fileName: string, rows: Array<Array<string | number>>): void { const csv = `\ufeff${rows.map((row) => row.map(csvEscape).join(";")).join("\n")}`; const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = fileName; link.click(); URL.revokeObjectURL(url); }
function hourLabel(date: Date): string { return `${String(date.getHours()).padStart(2, "0")}h`; }
/** Revenue per hour (one day), day (up to a month) or month, with empty buckets filled in so gaps show as zero. */
function groupRevenue(orders: Order[], start: Date, end: Date) {
  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
  const mode = days <= 1 ? "hour" : days <= 31 ? "day" : "month";
  const keyOf = (date: Date) => mode === "hour" ? `${toRestaurantDateKey(date)}-${String(date.getHours()).padStart(2, "0")}` : mode === "day" ? toRestaurantDateKey(date) : toRestaurantDateKey(date).slice(0, 7);
  const labelOf = (date: Date) => mode === "hour" ? hourLabel(date) : mode === "day" ? formatDate(date).slice(0, 5) : `${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
  const map = new Map<string, { label: string; faturamento: number; pedidos: number }>();
  const billable = orders.filter(isBillableOrder);
  if (!billable.length) return [];
  // Buckets from the first sale (hour mode) or period start, to the last sale or period end.
  const times = billable.map((order) => getOrderDate(order).getTime());
  const from = new Date(mode === "hour" ? Math.min(...times) : start.getTime());
  const to = new Date(mode === "hour" ? Math.max(...times) : Math.min(end.getTime(), Date.now()));
  for (const cursor = new Date(from); cursor <= to && map.size < 400;) {
    map.set(keyOf(cursor), { label: labelOf(cursor), faturamento: 0, pedidos: 0 });
    if (mode === "hour") { cursor.setMinutes(0, 0, 0); cursor.setHours(cursor.getHours() + 1); } else if (mode === "day") { cursor.setHours(12, 0, 0, 0); cursor.setDate(cursor.getDate() + 1); } else { cursor.setDate(1); cursor.setMonth(cursor.getMonth() + 1); }
  }
  billable.forEach((order) => { const date = getOrderDate(order); const key = keyOf(date); const current = map.get(key) ?? { label: labelOf(date), faturamento: 0, pedidos: 0 }; current.faturamento += order.total; current.pedidos += 1; map.set(key, current); });
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => ({ ...value, faturamento: Number(value.faturamento.toFixed(2)) }));
}

export default function RelatoriosPage(): JSX.Element {
  const { user, isLoading: authLoading } = useAdminAuth();
  const [preset, setPreset] = useState<PeriodPreset>("today");
  const [customStart, setCustomStart] = useState(isoLocalInput(new Date()));
  const [customEnd, setCustomEnd] = useState(isoLocalInput(new Date()));
  const [activeTab, setActiveTab] = useState<Tab>("Resumo");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [previousOrders, setPreviousOrders] = useState<Order[]>([]);
  const [sessions, setSessions] = useState<TableSession[]>([]);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [orderSort, setOrderSort] = useState<SortOrders>("recent");
  const [tableSort, setTableSort] = useState<SortTables>("revenue");
  const [productLimit, setProductLimit] = useState("10");
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>("all");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionLimit, setSessionLimit] = useState(25);

  const period = useMemo(() => resolveReportPeriod(preset, customStart, customEnd), [customEnd, customStart, preset]);
  const periodInvalid = period.start.getTime() > period.end.getTime();
  const previousPeriod = useMemo(() => getPreviousPeriod(period), [period]);
  const services = useMemo(() => ({ orders: new OrdersService({ scope: "admin" }), reports: new ReportsService({ scope: "admin" }), sessions: new SessionsService({ scope: "admin" }), menu: new MenuService({ scope: "admin" }), restaurants: new RestaurantsService({ scope: "admin" }) }), []);

  const loadReports = useCallback(async (isRefresh = false) => {
    if (!user?.restaurantId || periodInvalid) return;
    isRefresh ? setRefreshing(true) : setLoading(true); setError(null);
    try {
      const [currentOrders, prevOrders, currentSessions, currentEvents, cats, items, restaurantData] = await Promise.all([
        services.orders.listByRestaurantPeriod(user.restaurantId, period.start.toISOString(), period.end.toISOString()),
        services.orders.listByRestaurantPeriod(user.restaurantId, previousPeriod.start.toISOString(), previousPeriod.end.toISOString()),
        services.sessions.listByRestaurantPeriod(user.restaurantId, period.start.toISOString(), period.end.toISOString()),
        services.reports.listOrderEventsPeriod(user.restaurantId, period.start.toISOString(), period.end.toISOString()),
        services.menu.listCategories(user.restaurantId), services.menu.listItems(user.restaurantId), services.restaurants.getByRestaurantId(user.restaurantId)
      ]);
      setOrders(currentOrders); setPreviousOrders(prevOrders); setSessions(currentSessions); setEvents(currentEvents); setCategories(cats); setMenuItems(items); setRestaurant(restaurantData);
    } catch (failure) { setError(`Não foi possível carregar os relatórios. ${describeFirebaseError(failure)}`); setOrders([]); setSessions([]); setEvents([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, [period, periodInvalid, previousPeriod, services, user?.restaurantId]);

  useEffect(() => { void loadReports(false); }, [loadReports]);

  const filteredOrders = useMemo(() => filterOrdersByPeriod(orders, period), [orders, period]);
  const filteredSessions = useMemo(() => filterSessionsByPeriod(sessions, period), [sessions, period]);
  const summary = useMemo(() => calculateSummary(filteredOrders, filteredSessions), [filteredOrders, filteredSessions]);
  const previousSummary = useMemo(() => calculateSummary(previousOrders, []), [previousOrders]);
  const revenueComparison = compareValues(summary.revenue, previousSummary.revenue);
  const products = useMemo(() => groupProducts(filteredOrders, menuItems, categories), [categories, filteredOrders, menuItems]);
  const categoriesReport = useMemo(() => groupCategories(products), [products]);
  const payments = useMemo(() => groupPayments(filteredOrders), [filteredOrders]);
  const tables = useMemo(() => { const rows = groupTables(filteredOrders, filteredSessions, events); return rows.sort((a, b) => tableSort === "attendances" ? b.attendances - a.attendances : tableSort === "orders" ? b.orders - a.orders : tableSort === "duration" ? b.averageDurationMinutes - a.averageDurationMinutes : b.revenue - a.revenue); }, [events, filteredOrders, filteredSessions, tableSort]);
  const revenueData = useMemo(() => groupRevenue(filteredOrders, period.start, period.end), [filteredOrders, period.end, period.start]);
  const orderedOrders = useMemo(() => [...filteredOrders].sort((a, b) => orderSort === "old" ? getOrderDate(a).getTime() - getOrderDate(b).getTime() : orderSort === "highest" ? b.total - a.total : orderSort === "lowest" ? a.total - b.total : getOrderDate(b).getTime() - getOrderDate(a).getTime()), [filteredOrders, orderSort]);
  const displayedOrders = orderedOrders.slice(0, 50);
  const visibleProducts = productLimit === "all" ? products : products.slice(0, Number(productLimit));
  const sessionRows = [...filteredSessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).filter((session) => sessionFilter === "all" || (sessionFilter === "open" ? !session.closedAt && session.status !== "closed" : Boolean(session.closedAt) || session.status === "closed"));
  const busiestRevenue = revenueData.reduce((best, item) => item.faturamento > best.faturamento ? item : best, { label: "-", faturamento: 0, pedidos: 0 });
    const statusCounts = filteredOrders.reduce<Record<Order["status"], number>>((acc, order) => { acc[order.status] += 1; return acc; }, { received: 0, confirmed: 0, in_preparation: 0, ready: 0, delivered: 0, cancelled: 0 });
  const cancellationReasons = Object.entries(filteredOrders.filter(isCancelledOrder).reduce<Record<string, number>>((acc, order) => { const reason = order.cancellationReason?.trim() || "Não informado"; acc[reason] = (acc[reason] ?? 0) + 1; return acc; }, {})).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);

  function ordersOf(session: TableSession): Order[] { return filteredOrders.filter((o) => o.sessionId === session.id || o.sessionToken === session.sessionToken); }
  const cancelledOrders = filteredOrders.filter(isCancelledOrder);
  const spanDays = Math.ceil((period.end.getTime() - period.start.getTime()) / 86400000);
  const bucket = spanDays <= 1 ? "hora" : spanDays > 31 ? "mês" : "dia";

  function exportReport(kind: ExportKind): void {
    const file = `qrapido-relatorio-${kind}-${toDateKey(period.start)}-a-${toDateKey(period.end)}.csv`;
    const rows: Array<Array<string | number>> = kind === "pedidos" ? [["Código", "Mesa", "Data", "Itens", "Valor", "Pagamento", "Status"], ...orderedOrders.map((o) => [(o.orderCode || o.id.slice(0, 8)), o.tableNumber, formatDateTime(o.receivedAt), o.items.reduce((s, i) => s + i.quantity, 0), formatCurrency(o.total), PAYMENT_LABELS[o.paymentMethod], STATUS_LABELS[o.status]])] : kind === "produtos" ? [["Produto", "Categoria", "Quantidade", "Faturamento", "Participação"], ...products.map((p) => [p.name, p.category, p.quantity, formatCurrency(p.revenue), `${p.share.toFixed(1)}%`])] : kind === "categorias" ? [["Categoria", "Quantidade", "Faturamento", "Participação"], ...categoriesReport.map((c) => [c.name, c.quantity, formatCurrency(c.revenue), `${c.share.toFixed(1)}%`])] : kind === "pagamentos" ? [["Forma", "Pedidos", "Total", "Participação", "Pendentes", "Confirmados", "Simulados", "Entregues", "Cancelados"], ...payments.map((p) => [PAYMENT_LABELS[p.method], p.orders, formatCurrency(p.total), `${p.share.toFixed(1)}%`, p.pending, p.confirmed, p.simulated, p.delivered, p.cancelled])] : kind === "atendimentos" ? [["Mesa", "Pessoas", "Abertura", "Encerramento", "Duração (min)", "Pedidos", "Total", "Recibo"], ...filteredSessions.map((s) => { const os = ordersOf(s); const duration = sessionDurationMinutes(s); return [s.tableNumber, s.peopleCount, formatDateTime(s.startedAt), s.closedAt ? formatDateTime(s.closedAt) : "Aberta", duration === null ? "" : duration.toFixed(0), os.length, formatCurrency(os.filter(isBillableOrder).reduce((sum, o) => sum + o.total, 0)), s.receiptNumber ? String(s.receiptNumber) : ""]; })] : kind === "mesas" ? [["Mesa", "Atendimentos", "Pedidos", "Faturamento", "Ticket médio", "Tempo médio", "Chamadas"], ...tables.map((t) => [t.tableNumber, t.attendances, t.orders, formatCurrency(t.revenue), formatCurrency(t.averageTicket), `${t.averageDurationMinutes.toFixed(0)} min`, t.waiterCalls])] : [["Indicador", "Valor"], ["Faturamento", formatCurrency(summary.revenue)], ["Pedidos válidos", summary.validOrders], ["Ticket médio", formatCurrency(summary.averageTicket)], ["Itens vendidos", summary.soldItems], ["Cancelamentos", summary.cancelledOrders], ["Taxa de cancelamento", `${summary.cancellationRate.toFixed(1)}%`]];
    downloadCsv(file, rows);
  }

  if (authLoading || loading) return <div className="space-y-4" aria-busy="true" aria-label="Carregando relatórios"><AppSkeleton className="h-12" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <AppSkeleton key={i} className="h-28" />)}</div><AppSkeleton className="h-72" /></div>;
  if (!user || !["admin", "manager", "attendant"].includes(user.role)) return <AppEmptyState title="Você não possui permissão para acessar os relatórios." description="Entre com uma conta administrativa ou solicite autorização ao responsável." />;

  const nothing = filteredOrders.length === 0 && filteredSessions.length === 0;
  const th = "px-3 py-2 text-left text-xs font-medium text-[hsl(var(--foreground-muted))]";
  const thNum = cn(th, "text-right");
  const td = "px-3 py-2.5";
  const tdNum = cn(td, "text-right tabular-nums");

  return <section className="space-y-5 print:space-y-3">
    <div className="space-y-3 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Período">
          {PERIODS.map((item) => <button key={item.value} type="button" role="radio" aria-checked={preset === item.value} onClick={() => setPreset(item.value)} className={cn("h-9 shrink-0 rounded-full border px-3.5 text-sm font-semibold", preset === item.value ? "border-[hsl(var(--foreground))] bg-[hsl(var(--foreground))] text-[hsl(var(--background))]" : "border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] hover:bg-[hsl(var(--surface-muted))]")}>{item.label}</button>)}
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu options={EXPORTS} onPick={(value) => exportReport(value as ExportKind)} />
          <button type="button" onClick={() => window.print()} aria-label="Imprimir" title="Imprimir" className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] hover:bg-[hsl(var(--surface-muted))]"><Printer className="h-4 w-4" /></button>
          <button type="button" onClick={() => void loadReports(true)} disabled={refreshing || periodInvalid} aria-label="Atualizar" title="Atualizar" className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] hover:bg-[hsl(var(--surface-muted))] disabled:opacity-50"><RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} /></button>
        </div>
      </div>
      {preset === "custom" ? <div className="flex flex-wrap items-center gap-2 text-sm"><span>De</span><AppTextInput type="date" aria-label="Data inicial" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-9 w-auto" /><span>até</span><AppTextInput type="date" aria-label="Data final" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-9 w-auto" />{periodInvalid ? <span className="text-[hsl(var(--danger))]">A data inicial não pode ser depois da final.</span> : null}</div> : null}
    </div>

    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-[hsl(var(--border))]">
      <nav className="-mb-px flex gap-1 overflow-x-auto print:hidden" aria-label="Relatórios">{REPORT_TABS.map((tab) => <button key={tab} type="button" aria-current={activeTab === tab ? "page" : undefined} onClick={() => setActiveTab(tab)} className={cn("shrink-0 border-b-2 px-3 pb-2.5 pt-1 text-sm font-semibold", activeTab === tab ? "border-[hsl(var(--primary))] text-[hsl(var(--foreground))]" : "border-transparent text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--foreground))]")}>{tab}</button>)}</nav>
      <p className="pb-2.5 text-sm text-[hsl(var(--foreground-muted))]">{restaurant?.name ? `${restaurant.name}, ` : ""}{periodLabel(period.start, period.end)}</p>
    </div>

    {error ? <AppEmptyState title="Erro ao carregar relatórios" description={error} /> : null}
    {!error && nothing ? <AppEmptyState title="Nenhum pedido neste período" description="Escolha outro período ou volte depois que as mesas fizerem pedidos." /> : null}

    {!nothing && activeTab === "Resumo" && <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label="Faturamento" value={formatCurrency(summary.revenue)} comparison={revenueComparison} note="Pedidos entregues." />
        <Kpi label="Pedidos entregues" value={`${summary.validOrders}`} note={summary.cancelledOrders ? `${summary.cancelledOrders} cancelado(s), ${summary.cancellationRate.toFixed(0)}% do total` : "Nenhum cancelado"} />
        <Kpi label="Ticket médio" value={formatCurrency(summary.averageTicket)} note={`${summary.soldItems} itens vendidos`} />
        <Kpi label="Atendimentos" value={`${summary.attendances}`} note={`Em ${summary.usedTables} mesa(s)`} />
      </div>
      <ReportBlock title={`Faturamento por ${bucket}`} description={busiestRevenue.faturamento > 0 ? `Maior movimento: ${busiestRevenue.label}, com ${formatCurrency(busiestRevenue.faturamento)} em ${busiestRevenue.pedidos} pedido(s).` : undefined}>
        <RevenueChart data={revenueData} />
      </ReportBlock>
      <div className="grid gap-5 lg:grid-cols-2">
        <ReportBlock title="Mais vendidos" action={<button type="button" onClick={() => setActiveTab("Produtos")} className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline">Ver todos</button>}>
          <ShareList empty="Nenhum produto entregue." rows={products.slice(0, 5).map((p) => ({ key: p.key, label: p.name, detail: `${p.quantity}x`, value: formatCurrency(p.revenue), share: p.quantity }))} />
        </ReportBlock>
        <ReportBlock title="Formas de pagamento" description="Escolhidas pelos clientes nos pedidos entregues.">
          <ShareList empty="Nenhum pagamento no período." rows={payments.filter((p) => p.total > 0).map((p) => ({ key: p.method, label: PAYMENT_LABELS[p.method] ?? p.method, detail: `${p.share.toFixed(0)}%`, value: formatCurrency(p.total), share: p.total }))} />
        </ReportBlock>
      </div>
    </>}

    {!nothing && activeTab === "Produtos" && <>
      <ReportBlock title="Categorias" description="Quanto cada parte do cardápio vendeu.">
        <ShareList empty="Nenhuma venda entregue." rows={categoriesReport.map((c) => ({ key: c.name, label: c.name, detail: `${c.quantity} itens`, value: formatCurrency(c.revenue), share: c.revenue }))} />
      </ReportBlock>
      <ReportBlock title="Produtos" description="Pelo nome e preço gravados no pedido, mesmo que o item tenha mudado depois." action={<AppSelect aria-label="Quantos produtos mostrar" value={productLimit} onChange={(e) => setProductLimit(e.target.value)} className="h-9 w-auto"><option value="10">10 mais vendidos</option><option value="5">5 mais vendidos</option><option value="all">Todos</option></AppSelect>}>
        <div className="-mx-4 overflow-x-auto md:-mx-5"><table className="w-full min-w-[34rem] text-sm"><thead><tr className="border-b border-[hsl(var(--border))]"><th className={cn(th, "w-10 pl-4 md:pl-5")}>#</th><th className={th}>Produto</th><th className={th}>Categoria</th><th className={thNum}>Qtd.</th><th className={thNum}>Faturamento</th><th className={cn(thNum, "pr-4 md:pr-5")}>% dos itens</th></tr></thead><tbody>{visibleProducts.map((p, i) => <tr key={p.key} className="border-b border-[hsl(var(--border))] last:border-0"><td className={cn(td, "pl-4 text-[hsl(var(--foreground-muted))] md:pl-5")}>{i + 1}</td><td className={cn(td, "font-medium")}>{p.name}</td><td className={cn(td, "text-[hsl(var(--foreground-muted))]")}>{p.category}</td><td className={tdNum}>{p.quantity}</td><td className={tdNum}>{formatCurrency(p.revenue)}</td><td className={cn(tdNum, "pr-4 md:pr-5")}>{p.share.toFixed(1)}%</td></tr>)}</tbody></table></div>
        {products.length === 0 ? <p className="text-sm text-[hsl(var(--foreground-muted))]">Nenhum produto entregue neste período.</p> : null}
      </ReportBlock>
    </>}

    {!nothing && activeTab === "Pedidos" && <>
      <div className="flex flex-wrap gap-2">{(Object.keys(STATUS_LABELS) as Order["status"][]).filter((s) => statusCounts[s] > 0).map((s) => <span key={s} className={cn("rounded-full px-3 py-1 text-sm", s === "cancelled" ? "bg-[hsl(var(--danger)/0.1)] text-[hsl(var(--danger))]" : "bg-[hsl(var(--surface-muted))]")}><span className="font-semibold tabular-nums">{statusCounts[s]}</span> {STATUS_LABELS[s].toLowerCase()}</span>)}</div>
      <ReportBlock title="Pedidos" description="Só os entregues entram no faturamento." action={<AppSelect aria-label="Ordenar pedidos" value={orderSort} onChange={(e) => setOrderSort(e.target.value as SortOrders)} className="h-9 w-auto"><option value="recent">Mais recentes</option><option value="old">Mais antigos</option><option value="highest">Maior valor</option><option value="lowest">Menor valor</option></AppSelect>}>
        <div className="-mx-4 overflow-x-auto md:-mx-5"><table className="w-full min-w-[40rem] text-sm"><thead><tr className="border-b border-[hsl(var(--border))]"><th className={cn(th, "pl-4 md:pl-5")}>Pedido</th><th className={th}>Mesa</th><th className={th}>Quando</th><th className={thNum}>Itens</th><th className={thNum}>Valor</th><th className={th}>Pagamento</th><th className={cn(th, "pr-4 md:pr-5")}>Situação</th></tr></thead><tbody>{displayedOrders.map((o) => <tr key={o.id} className="border-b border-[hsl(var(--border))] last:border-0"><td className={cn(td, "pl-4 font-medium md:pl-5")}>{o.orderCode || o.id.slice(0, 8)}</td><td className={td}>{o.tableNumber}</td><td className={cn(td, "whitespace-nowrap text-[hsl(var(--foreground-muted))]")}>{formatDateTime(o.receivedAt)}</td><td className={tdNum}>{o.items.reduce((s, i) => s + i.quantity, 0)}</td><td className={cn(tdNum, isCancelledOrder(o) && "text-[hsl(var(--foreground-muted))] line-through")}>{formatCurrency(o.total)}</td><td className={td}>{PAYMENT_LABELS[o.paymentMethod] ?? "-"}</td><td className={cn(td, "pr-4 md:pr-5", isCancelledOrder(o) && "text-[hsl(var(--danger))]")}>{STATUS_LABELS[o.status]}</td></tr>)}</tbody></table></div>
        {orderedOrders.length > 50 ? <p className="mt-3 text-xs text-[hsl(var(--foreground-muted))]">Mostrando 50 de {orderedOrders.length}. A planilha de pedidos traz todos.</p> : null}
      </ReportBlock>
      {cancelledOrders.length ? <ReportBlock title="Cancelamentos" description={`${cancelledOrders.length} pedido(s), ${formatCurrency(cancelledOrders.reduce((s, o) => s + o.total, 0))} que não foram cobrados.`}>
        <ShareList empty="" rows={cancellationReasons.map((r) => ({ key: r.reason, label: r.reason, value: `${r.count}x`, share: r.count }))} />
      </ReportBlock> : null}
    </>}

    {!nothing && activeTab === "Mesas" && <>
      <ReportBlock title="Por mesa" action={<AppSelect aria-label="Ordenar mesas" value={tableSort} onChange={(e) => setTableSort(e.target.value as SortTables)} className="h-9 w-auto"><option value="revenue">Maior faturamento</option><option value="attendances">Mais atendimentos</option><option value="orders">Mais pedidos</option><option value="duration">Mais tempo ocupada</option></AppSelect>}>
        <div className="-mx-4 overflow-x-auto md:-mx-5"><table className="w-full min-w-[36rem] text-sm"><thead><tr className="border-b border-[hsl(var(--border))]"><th className={cn(th, "pl-4 md:pl-5")}>Mesa</th><th className={thNum}>Atendimentos</th><th className={thNum}>Pedidos</th><th className={thNum}>Faturamento</th><th className={thNum}>Ticket médio</th><th className={cn(thNum, "pr-4 md:pr-5")}>Tempo médio</th></tr></thead><tbody>{tables.map((t) => <tr key={t.tableId} className="border-b border-[hsl(var(--border))] last:border-0"><td className={cn(td, "pl-4 font-medium md:pl-5")}>Mesa {t.tableNumber}</td><td className={tdNum}>{t.attendances}</td><td className={tdNum}>{t.orders}</td><td className={tdNum}>{formatCurrency(t.revenue)}</td><td className={tdNum}>{formatCurrency(t.averageTicket)}</td><td className={cn(tdNum, "pr-4 md:pr-5")}>{t.averageDurationMinutes ? `${t.averageDurationMinutes.toFixed(0)} min` : "-"}</td></tr>)}</tbody></table></div>
      </ReportBlock>
      <ReportBlock title="Atendimentos" description="Cada vez que uma mesa foi aberta. Toque para ver os pedidos." action={<AppSelect aria-label="Filtrar atendimentos" value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value as SessionFilter)} className="h-9 w-auto">{Object.entries(SESSION_FILTERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</AppSelect>}>
        <div className="-mx-4 overflow-x-auto md:-mx-5"><table className="w-full min-w-[40rem] text-sm"><thead><tr className="border-b border-[hsl(var(--border))]"><th className={cn(th, "pl-4 md:pl-5")}>Mesa</th><th className={th}>Abertura</th><th className={thNum}>Duração</th><th className={thNum}>Pedidos</th><th className={thNum}>Total</th><th className={cn(th, "pr-4 md:pr-5")}>Situação</th></tr></thead><tbody>{sessionRows.slice(0, sessionLimit).map((s) => { const os = ordersOf(s); const duration = sessionDurationMinutes(s); const open = selectedSessionId === s.id; return <Fragment key={s.id}><tr className={cn("cursor-pointer border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--surface-muted))]", open && "bg-[hsl(var(--surface-muted))]")} onClick={() => setSelectedSessionId(open ? null : s.id)}><td className={cn(td, "pl-4 font-medium md:pl-5")}><button type="button" aria-expanded={open} className="inline-flex items-center gap-1.5"><ChevronDown className={cn("h-4 w-4 transition-transform", open ? "rotate-180" : "-rotate-90")} aria-hidden />Mesa {s.tableNumber}</button></td><td className={cn(td, "whitespace-nowrap text-[hsl(var(--foreground-muted))]")}>{formatDateTime(s.startedAt)}</td><td className={tdNum}>{duration === null ? "-" : `${duration.toFixed(0)} min`}</td><td className={tdNum}>{os.length}</td><td className={tdNum}>{formatCurrency(os.filter(isBillableOrder).reduce((sum, o) => sum + o.total, 0))}</td><td className={cn(td, "pr-4 md:pr-5")}>{sessionStatusLabels[s.status as keyof typeof sessionStatusLabels] ?? s.status}{s.receiptNumber ? <span className="ml-1 text-[hsl(var(--foreground-muted))]">(recibo nº {s.receiptNumber})</span> : null}</td></tr>{open ? <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-muted)/0.5)]"><td colSpan={6} className="px-4 py-3 md:px-5"><p className="mb-1 text-xs text-[hsl(var(--foreground-muted))]">{s.peopleCount} pessoa(s){s.closedAt ? `, fechada em ${formatDateTime(s.closedAt)}` : ", ainda aberta"}{s.notes ? `. ${s.notes}` : ""}</p>{os.length ? <ul className="space-y-1">{os.map((o) => <li key={o.id} className="flex justify-between gap-3"><span className="min-w-0"><span className="font-medium">{o.orderCode || o.id.slice(0, 8)}</span> {o.items.map((i) => `${i.quantity}x ${i.nameSnapshot}`).join(", ")}</span><span className={cn("shrink-0 tabular-nums", isCancelledOrder(o) && "line-through text-[hsl(var(--foreground-muted))]")}>{formatCurrency(o.total)}</span></li>)}</ul> : <p className="text-sm">Sem pedidos.</p>}</td></tr> : null}</Fragment>; })}</tbody></table></div>
        {sessionRows.length === 0 ? <p className="text-sm text-[hsl(var(--foreground-muted))]">Nenhum atendimento com esse filtro.</p> : null}
        {sessionRows.length > sessionLimit ? <div className="mt-3 flex items-center justify-between gap-3 text-sm print:hidden"><span className="text-[hsl(var(--foreground-muted))]">Mostrando {sessionLimit} de {sessionRows.length}.</span><button type="button" onClick={() => setSessionLimit((n) => n + 25)} className="font-semibold text-[hsl(var(--primary))] hover:underline">Mostrar mais</button></div> : null}
      </ReportBlock>
    </>}
    <footer className="hidden text-center text-xs text-slate-600 print:block">Gerado em {formatDateTime(new Date())}. Sistema QRápido.</footer>
  </section>;
}
