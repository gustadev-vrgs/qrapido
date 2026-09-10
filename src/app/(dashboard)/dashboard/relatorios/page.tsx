"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, Printer, RefreshCw } from "lucide-react";

import { AppActionButton, AppDataCard, AppEmptyState, AppSectionCard, AppSelect, AppSkeleton, AppStatCard, AppStatusBadge, AppTextInput } from "@/components/ui/app-design-system";
import { MenuService } from "@/lib/data/services/menu-service";
import { OrdersService } from "@/lib/data/services/orders-service";
import { ReportsService } from "@/lib/data/services/reports-service";
import { SessionsService } from "@/lib/data/services/sessions-service";
import { RestaurantsService } from "@/lib/data/services/restaurants-service";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import type { MenuCategory, MenuItem, Order, OrderEvent, Restaurant, TableSession } from "@/lib/types/domain";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils/formatters";
import { calculateSummary, compareValues, filterOrdersByPeriod, filterSessionsByPeriod, getOrderDate, getPreviousPeriod, groupCategories, groupPayments, groupProducts, groupTables, isBillableOrder, isCancelledOrder, resolveReportPeriod, safePercent, sessionDurationMinutes, toDateKey, type PeriodPreset } from "@/lib/utils/report-calculations";

const STATUS_LABELS: Record<Order["status"], string> = { received: "Recebido", confirmed: "Confirmado", in_preparation: "Em preparo", ready: "Pronto", delivered: "Entregue", cancelled: "Cancelado" };
const PAYMENT_LABELS: Record<string, string> = { pix: "PIX", cash: "Dinheiro", debit_card: "Débito", credit_card: "Crédito", card_on_counter: "Cartão no balcão", card_on_table: "Cartão na mesa", other: "Outras" };
const SESSION_FILTERS = { all: "Todas", open: "Abertas", closed: "Encerradas" } as const;
const REPORT_TABS = ["Resumo", "Faturamento", "Pedidos", "Produtos", "Categorias", "Pagamentos", "Mesas", "Atendimentos", "Cancelamentos"] as const;

type Tab = (typeof REPORT_TABS)[number];
type SessionFilter = keyof typeof SESSION_FILTERS;
type ExportKind = "resumo" | "pedidos" | "produtos" | "categorias" | "pagamentos" | "mesas" | "atendimentos" | "cancelamentos";

type SortOrders = "recent" | "old" | "highest" | "lowest";
type SortTables = "revenue" | "attendances" | "orders" | "duration";

function isoLocalInput(date: Date): string { return toDateKey(date); }
function periodLabel(start: Date, end: Date): string { return `${formatDate(start)} a ${formatDate(end)}`; }
function csvEscape(value: string | number): string { const text = String(value); const safe = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text; return `"${safe.replaceAll('"', '""')}"`; }
function downloadCsv(fileName: string, rows: Array<Array<string | number>>): void { const csv = `\ufeff${rows.map((row) => row.map(csvEscape).join(";")).join("\n")}`; const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = fileName; link.click(); URL.revokeObjectURL(url); }
function hourLabel(date: Date): string { return `${String(date.getHours()).padStart(2, "0")}h`; }
function groupRevenue(orders: Order[], start: Date, end: Date) { const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000)); const mode = days <= 1 ? "hour" : days <= 31 ? "day" : "month"; const map = new Map<string, { label: string; faturamento: number; pedidos: number }>(); orders.filter(isBillableOrder).forEach((order) => { const date = getOrderDate(order); const key = mode === "hour" ? `${toDateKey(date)}-${date.getHours()}` : mode === "day" ? toDateKey(date) : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; const current = map.get(key) ?? { label: mode === "hour" ? hourLabel(date) : mode === "day" ? formatDate(date) : key, faturamento: 0, pedidos: 0 }; current.faturamento += order.total; current.pedidos += 1; map.set(key, current); }); return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => ({ ...value, faturamento: Number(value.faturamento.toFixed(2)) })); }

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
  const [productLimit, setProductLimit] = useState("5");
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>("all");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

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
        services.menu.listCategories(user.restaurantId), services.menu.listItems(user.restaurantId), services.restaurants.getById(user.restaurantId)
      ]);
      setOrders(currentOrders); setPreviousOrders(prevOrders); setSessions(currentSessions); setEvents(currentEvents); setCategories(cats); setMenuItems(items); setRestaurant(restaurantData);
    } catch { setError("Não foi possível carregar os relatórios. Tente atualizar os dados."); setOrders([]); setSessions([]); setEvents([]); }
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
  const selectedSession = selectedSessionId ? filteredSessions.find((session) => session.id === selectedSessionId) ?? null : null;
  const sessionRows = filteredSessions.filter((session) => sessionFilter === "all" || (sessionFilter === "open" ? !session.closedAt && session.status !== "closed" : Boolean(session.closedAt) || session.status === "closed"));
  const busiestRevenue = revenueData.reduce((best, item) => item.faturamento > best.faturamento ? item : best, { label: "-", faturamento: 0, pedidos: 0 });
  const averageDailyRevenue = summary.revenue / Math.max(1, Math.ceil((period.end.getTime() - period.start.getTime()) / 86400000));
  const statusCounts = filteredOrders.reduce<Record<Order["status"], number>>((acc, order) => { acc[order.status] += 1; return acc; }, { received: 0, confirmed: 0, in_preparation: 0, ready: 0, delivered: 0, cancelled: 0 });
  const cancellationReasons = [{ reason: "Não informado", count: statusCounts.cancelled }];

  function exportReport(kind: ExportKind): void {
    const file = `qrapido-relatorio-${kind}-${toDateKey(period.start)}-a-${toDateKey(period.end)}.csv`;
    const rows: Array<Array<string | number>> = kind === "pedidos" ? [["Código", "Mesa", "Data", "Itens", "Valor", "Pagamento", "Status"], ...orderedOrders.map((o) => [o.id.slice(0, 8), o.tableNumber, formatDateTime(o.receivedAt), o.items.reduce((s, i) => s + i.quantity, 0), formatCurrency(o.total), PAYMENT_LABELS[o.paymentMethod], STATUS_LABELS[o.status]])] : kind === "produtos" ? [["Produto", "Categoria", "Quantidade", "Faturamento", "Participação"], ...products.map((p) => [p.name, p.category, p.quantity, formatCurrency(p.revenue), `${p.share.toFixed(1)}%`])] : kind === "categorias" ? [["Categoria", "Quantidade", "Faturamento", "Participação"], ...categoriesReport.map((c) => [c.name, c.quantity, formatCurrency(c.revenue), `${c.share.toFixed(1)}%`])] : kind === "pagamentos" ? [["Forma", "Pedidos", "Total", "Participação", "Pendentes", "Confirmados", "Simulados", "Entregues", "Cancelados"], ...payments.map((p) => [PAYMENT_LABELS[p.method], p.orders, formatCurrency(p.total), `${p.share.toFixed(1)}%`, p.pending, p.confirmed, p.simulated, p.delivered, p.cancelled])] : kind === "mesas" ? [["Mesa", "Atendimentos", "Pedidos", "Faturamento", "Ticket médio", "Tempo médio", "Chamadas"], ...tables.map((t) => [t.tableNumber, t.attendances, t.orders, formatCurrency(t.revenue), formatCurrency(t.averageTicket), `${t.averageDurationMinutes.toFixed(0)} min`, t.waiterCalls])] : [["Indicador", "Valor"], ["Faturamento", formatCurrency(summary.revenue)], ["Pedidos válidos", summary.validOrders], ["Ticket médio", formatCurrency(summary.averageTicket)], ["Itens vendidos", summary.soldItems], ["Cancelamentos", summary.cancelledOrders], ["Taxa de cancelamento", `${summary.cancellationRate.toFixed(1)}%`]];
    downloadCsv(file, rows);
  }

  if (authLoading || loading) return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <AppSkeleton key={i} className="h-28" />)}</div>;
  if (!user || !["admin", "manager", "attendant"].includes(user.role)) return <AppEmptyState title="Você não possui permissão para acessar os relatórios." description="Entre com uma conta administrativa ou solicite autorização ao responsável." />;

  return <section className="space-y-4 print:space-y-3">
    <header className="app-surface-strong flex flex-col gap-3 p-4 print:border-0 print:bg-white md:flex-row md:items-end md:justify-between">
      <div><p className="text-xs uppercase tracking-[0.18em] text-[hsl(var(--foreground-muted))]">{restaurant?.name ?? "QRápido"}</p><h1 className="text-2xl font-semibold">Relatórios</h1><p className="text-sm text-[hsl(var(--foreground-muted))]">Indicadores reais do Firestore para {periodLabel(period.start, period.end)}.</p>{periodInvalid ? <p className="text-sm text-[hsl(var(--danger))]">A data inicial não pode ser posterior à data final.</p> : null}</div>
      <div className="flex flex-wrap gap-2 print:hidden"><AppSelect value={preset} onChange={(e) => setPreset(e.target.value as PeriodPreset)}><option value="today">Hoje</option><option value="yesterday">Ontem</option><option value="last7">Últimos 7 dias</option><option value="last30">Últimos 30 dias</option><option value="currentMonth">Mês atual</option><option value="previousMonth">Mês anterior</option><option value="custom">Intervalo personalizado</option></AppSelect>{preset === "custom" ? <><AppTextInput type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} /><AppTextInput type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} /></> : null}<AppSelect onChange={(e) => exportReport(e.target.value as ExportKind)} defaultValue=""><option value="" disabled>Exportar CSV</option><option value="resumo">Resumo</option><option value="pedidos">Pedidos</option><option value="produtos">Produtos</option><option value="categorias">Categorias</option><option value="pagamentos">Pagamentos</option><option value="mesas">Mesas</option></AppSelect><AppActionButton variant="secondary" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Imprimir</AppActionButton><AppActionButton onClick={() => void loadReports(true)} disabled={refreshing || periodInvalid}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</AppActionButton></div>
    </header>
    {error ? <AppEmptyState title="Erro ao carregar relatórios" description={error} /> : null}
    <nav className="flex gap-2 overflow-x-auto print:hidden">{REPORT_TABS.map((tab) => <AppActionButton key={tab} variant={activeTab === tab ? "primary" : "secondary"} onClick={() => setActiveTab(tab)}>{tab}</AppActionButton>)}</nav>
    {filteredOrders.length === 0 && filteredSessions.length === 0 ? <AppEmptyState title="Nenhum pedido encontrado neste período." description="Ainda não existem dados suficientes para gerar este relatório para o período selecionado." /> : null}

    {(activeTab === "Resumo") && <><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><AppStatCard label="Faturamento total" value={formatCurrency(summary.revenue)} trend={revenueComparison.percent === null ? revenueComparison.label : `${revenueComparison.label}: ${formatCurrency(revenueComparison.absolute)} (${revenueComparison.percent.toFixed(1)}%)`} /><AppStatCard label="Pedidos válidos" value={`${summary.validOrders}`} /><AppStatCard label="Ticket médio" value={formatCurrency(summary.averageTicket)} /><AppStatCard label="Itens vendidos" value={`${summary.soldItems}`} /><AppStatCard label="Atendimentos" value={`${summary.attendances}`} /><AppStatCard label="Mesas utilizadas" value={`${summary.usedTables}`} /><AppStatCard label="Pedidos cancelados" value={`${summary.cancelledOrders}`} /><AppStatCard label="Taxa de cancelamento" value={`${summary.cancellationRate.toFixed(1)}%`} /></div><AppSectionCard title="Horários de maior movimento" description="Baseado em pedidos e sessões do período."><div className="grid gap-3 md:grid-cols-4"><AppDataCard title="Mais pedidos" metadata={busiestRevenue.label}>{busiestRevenue.pedidos} pedido(s)</AppDataCard><AppDataCard title="Maior faturamento" metadata={busiestRevenue.label}>{formatCurrency(busiestRevenue.faturamento)}</AppDataCard><AppDataCard title="Mesas abertas" metadata="Sessões no período">{filteredSessions.length}</AppDataCard><AppDataCard title="Dia de maior movimento" metadata={busiestRevenue.label}>Dados internos</AppDataCard></div></AppSectionCard></>}
    {activeTab === "Faturamento" && <AppSectionCard title="Faturamento ao longo do período" description={`Total acumulado ${formatCurrency(summary.revenue)} • maior movimento ${busiestRevenue.label} • média diária ${formatCurrency(averageDailyRevenue)}.`}><div className="h-72"><ResponsiveContainer><LineChart data={revenueData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" /><YAxis /><Tooltip formatter={(v) => formatCurrency(Number(v))} /><Legend /><Line dataKey="faturamento" name="Faturamento" stroke="#0ea5e9" strokeWidth={2} /><Line dataKey="pedidos" name="Pedidos" stroke="#22c55e" strokeWidth={2} /></LineChart></ResponsiveContainer></div></AppSectionCard>}
    {activeTab === "Pedidos" && <AppSectionCard title="Pedidos" description="Cancelados e em andamento não entram no faturamento." action={<AppSelect value={orderSort} onChange={(e) => setOrderSort(e.target.value as SortOrders)}><option value="recent">Mais recente</option><option value="old">Mais antigo</option><option value="highest">Maior valor</option><option value="lowest">Menor valor</option></AppSelect>}><div className="grid gap-3 md:grid-cols-3">{Object.entries(statusCounts).map(([s, c]) => <AppDataCard key={s} title={STATUS_LABELS[s as Order["status"]]} metadata={`${c} pedido(s)`} />)}</div><div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th>Código</th><th>Mesa</th><th>Data</th><th>Itens</th><th>Valor</th><th>Pagamento</th><th>Status</th><th>Status pagamento</th></tr></thead><tbody>{displayedOrders.map((o) => <tr key={o.id} className="border-t border-[hsl(var(--border))]"><td>{o.id.slice(0, 8)}</td><td>{o.tableNumber}</td><td>{formatDateTime(o.receivedAt)}</td><td>{o.items.reduce((s, i) => s + i.quantity, 0)}</td><td>{formatCurrency(o.total)}</td><td>{PAYMENT_LABELS[o.paymentMethod]}</td><td>{STATUS_LABELS[o.status]}</td><td>{isCancelledOrder(o) ? "Cancelado" : o.simulation || o.paymentMode === "system_simulated" ? "Simulado" : o.financialReceiptConfirmed ? "Confirmado financeiramente" : "Pendente"}</td></tr>)}</tbody></table></div><p className="mt-3 text-xs text-[hsl(var(--foreground-muted))]">Exibindo até 50 pedidos para preservar desempenho.</p></AppSectionCard>}
    {activeTab === "Produtos" && <AppSectionCard title="Produtos mais e menos vendidos" description="Usa o snapshot salvo no pedido para preservar histórico." action={<AppSelect value={productLimit} onChange={(e) => setProductLimit(e.target.value)}><option value="5">5 mais vendidos</option><option value="10">10 mais vendidos</option><option value="all">Todos</option></AppSelect>}><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th>#</th><th>Produto</th><th>Categoria</th><th>Quantidade</th><th>Faturamento</th><th>Participação</th></tr></thead><tbody>{visibleProducts.map((p, i) => <tr key={p.key} className="border-t border-[hsl(var(--border))]"><td>{i + 1}</td><td>{p.name}</td><td>{p.category}</td><td>{p.quantity}</td><td>{formatCurrency(p.revenue)}</td><td>{p.share.toFixed(1)}%</td></tr>)}</tbody></table></div><h3 className="mt-5">Menos vendidos</h3><div className="grid gap-2 md:grid-cols-3">{[...products].reverse().slice(0, 5).map((p) => <AppDataCard key={`low-${p.key}`} title={p.name} metadata={p.category}>{p.quantity} unidade(s)</AppDataCard>)}</div></AppSectionCard>}
    {activeTab === "Categorias" && <AppSectionCard title="Categorias mais vendidas"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{categoriesReport.map((c) => <AppDataCard key={c.name} title={c.name} metadata={`${c.share.toFixed(1)}% das vendas`}>{c.quantity} itens • {formatCurrency(c.revenue)}</AppDataCard>)}</div></AppSectionCard>}
    {activeTab === "Pagamentos" && <AppSectionCard title="Formas de pagamento" description="Pagamentos simulados representam registros internos do sistema, não confirmações bancárias reais."><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{payments.map((p) => <AppDataCard key={p.method} title={PAYMENT_LABELS[p.method]} metadata={`${p.share.toFixed(1)}% do faturamento`} status={<AppStatusBadge tone="info">Interno</AppStatusBadge>}>{p.orders} pedido(s) • {formatCurrency(p.total)}<br />Pendentes {p.pending} • Confirmados financeiramente {p.confirmed} • Simulados {p.simulated} • Entregues {p.delivered} • Cancelados {p.cancelled}</AppDataCard>)}</div></AppSectionCard>}
    {activeTab === "Mesas" && <AppSectionCard title="Relatório de mesas" action={<AppSelect value={tableSort} onChange={(e) => setTableSort(e.target.value as SortTables)}><option value="revenue">Maior faturamento</option><option value="attendances">Mais atendimentos</option><option value="orders">Mais pedidos</option><option value="duration">Maior tempo médio</option></AppSelect>}><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th>Mesa</th><th>Atendimentos</th><th>Pedidos</th><th>Faturamento</th><th>Ticket médio</th><th>Tempo médio</th><th>Chamadas</th><th>Abertas</th></tr></thead><tbody>{tables.map((t) => <tr key={t.tableId} className="border-t border-[hsl(var(--border))]"><td>{t.tableNumber}</td><td>{t.attendances}</td><td>{t.orders}</td><td>{formatCurrency(t.revenue)}</td><td>{formatCurrency(t.averageTicket)}</td><td>{t.averageDurationMinutes.toFixed(0)} min</td><td>{t.waiterCalls}</td><td>{t.openSessions}</td></tr>)}</tbody></table></div></AppSectionCard>}
    {activeTab === "Atendimentos" && <AppSectionCard title="Sessões de atendimento" action={<AppSelect value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value as SessionFilter)}>{Object.entries(SESSION_FILTERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</AppSelect>}><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th>Mesa</th><th>Pessoas</th><th>Abertura</th><th>Encerramento</th><th>Duração</th><th>Pedidos</th><th>Total</th><th>Status</th></tr></thead><tbody>{sessionRows.map((s) => { const os = filteredOrders.filter((o) => o.sessionId === s.id || o.sessionToken === s.sessionToken); const duration = sessionDurationMinutes(s); return <tr key={s.id} onClick={() => setSelectedSessionId(s.id)} className="cursor-pointer border-t border-[hsl(var(--border))]"><td>{s.tableNumber}</td><td>{s.peopleCount}</td><td>{formatDateTime(s.startedAt)}</td><td>{s.closedAt ? formatDateTime(s.closedAt) : "Aberta"}</td><td>{duration === null ? "-" : `${duration.toFixed(0)} min`}</td><td>{os.length}</td><td>{formatCurrency(os.filter(isBillableOrder).reduce((sum, o) => sum + o.total, 0))}</td><td>{s.status}</td></tr>; })}</tbody></table></div>{selectedSession ? <AppDataCard className="mt-4" title={`Detalhes da mesa ${selectedSession.tableNumber}`} metadata={selectedSession.notes ?? "Sem observações"}>{filteredOrders.filter((o) => o.sessionId === selectedSession.id || o.sessionToken === selectedSession.sessionToken).map((o) => <p key={o.id}>{o.id.slice(0, 8)} • {o.items.map((i) => `${i.quantity}x ${i.nameSnapshot}`).join(", ")} • {PAYMENT_LABELS[o.paymentMethod]} • {formatCurrency(o.total)}</p>)}<p>Chamadas de garçom: {events.filter((e) => e.sessionId === selectedSession.id && e.type === "waiter_called").length}</p></AppDataCard> : null}</AppSectionCard>}
    {activeTab === "Cancelamentos" && <AppSectionCard title="Cancelamentos" description="Valor de pedidos cancelados não é contabilizado como prejuízo real."><div className="grid gap-3 md:grid-cols-4"><AppStatCard label="Pedidos cancelados" value={`${summary.cancelledOrders}`} /><AppStatCard label="Valor de pedidos cancelados" value={formatCurrency(filteredOrders.filter(isCancelledOrder).reduce((s, o) => s + o.total, 0))} /><AppStatCard label="Taxa de cancelamento" value={`${summary.cancellationRate.toFixed(1)}%`} /><AppStatCard label="Motivo principal" value={cancellationReasons[0]?.reason ?? "Não informado"} /></div><div className="mt-4 grid gap-3 md:grid-cols-2"><AppDataCard title="Mesas com mais cancelamentos">{tables.filter((t) => t.orders > 0).map((t) => <p key={t.tableId}>Mesa {t.tableNumber}: {filteredOrders.filter((o) => o.tableId === t.tableId && isCancelledOrder(o)).length}</p>)}</AppDataCard><AppDataCard title="Produtos em pedidos cancelados">{filteredOrders.filter(isCancelledOrder).flatMap((o) => o.items).map((i, idx) => <p key={`${i.menuItemId}-${idx}`}>{i.quantity}x {i.nameSnapshot}</p>)}</AppDataCard></div></AppSectionCard>}
    <footer className="hidden text-center text-xs text-slate-600 print:block">Gerado em {formatDateTime(new Date())}. Sistema QRápido — projeto acadêmico.</footer>
  </section>;
}
