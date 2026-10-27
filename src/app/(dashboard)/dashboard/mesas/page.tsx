"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Copy, DoorClosed, DoorOpen, Download, Edit2, ExternalLink, KeyRound, Loader2, Plus, Power, Printer, QrCode, RefreshCw, TriangleAlert, Users, X } from "lucide-react";

import { AppActionButton, AppEmptyState, AppFilterBar, AppFormField, AppSectionCard, AppSelect, AppStatusBadge, AppSurface, AppTextInput, AppTextarea } from "@/components/ui/app-design-system";
import { describeFirebaseError } from "@/lib/data/errors";
import { TablesService } from "@/lib/data/services/tables-service";
import { useAdminApi } from "@/lib/hooks/use-admin-api";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import { useLiveOrders } from "@/lib/hooks/use-live-orders";
import { isSessionExpired, useLiveTables } from "@/lib/hooks/use-live-tables";
import type { Table, TableSession } from "@/lib/types/domain";
import { formatTime } from "@/lib/utils/formatters";
import { createQrDataUrl } from "@/lib/utils/qr";
import { buildPublicTableUrl, describePublicUrlProblem, isValidPublicTableToken, resolvePublicTableUrl } from "@/lib/utils/public-url";
import { appToast } from "@/lib/utils/toast";

type TableView = "free" | "occupied" | "expired" | "disabled";
type Filter = "all" | TableView;

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "free", label: "Livres" },
  { value: "occupied", label: "Ocupadas" },
  { value: "expired", label: "Tempo esgotado" },
  { value: "disabled", label: "Desativadas" }
];

const VIEW_META: Record<TableView, { label: string; tone: "success" | "info" | "warning" | "neutral"; accent: string }> = {
  free: { label: "Livre", tone: "success", accent: "border-[hsl(var(--success)/0.35)] bg-[hsl(var(--success)/0.06)]" },
  occupied: { label: "Ocupada", tone: "info", accent: "border-[hsl(var(--info)/0.4)] bg-[hsl(var(--info)/0.07)]" },
  expired: { label: "Tempo esgotado", tone: "warning", accent: "border-[hsl(var(--warning)/0.45)] bg-[hsl(var(--warning)/0.08)]" },
  disabled: { label: "Desativada", tone: "neutral", accent: "border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))]" }
};

const DURATION_OPTIONS = [
  { value: "", label: "Padrão do restaurante" },
  { value: "120", label: "2 horas" },
  { value: "240", label: "4 horas" },
  { value: "360", label: "6 horas" },
  { value: "720", label: "12 horas" }
];

function viewOf(table: Table, session: TableSession | undefined): TableView {
  if (table.isActive === false) return "disabled";
  if (session) return isSessionExpired(session) ? "expired" : "occupied";
  if (table.status === "active" || table.status === "blocked" || table.status === "awaiting_payment") return "expired"; // occupied without a live attendance: close it
  return "free";
}

function formatCode(code: string | null | undefined): string {
  return code && code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : "------";
}

function remaining(session: TableSession, now: number): string {
  const minutes = Math.round((new Date(session.expiresAt).getTime() - now) / 60000);
  if (minutes <= 0) return "tempo esgotado";
  if (minutes < 60) return `${minutes} min restantes`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")} restantes`;
}

function createClientToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="app-surface-strong max-h-[calc(100vh-2rem)] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl p-5">
        <header className="flex items-start justify-between gap-3">
          <h3 className="text-xl font-semibold">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-1 text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--surface-muted))]"><X className="h-5 w-5" /></button>
        </header>
        {children}
      </div>
    </div>
  );
}

export default function MesasPage(): JSX.Element {
  const { user } = useAdminAuth();
  const api = useAdminApi();
  const canManageTables = user?.role === "admin" || user?.role === "manager";
  const canOperate = canManageTables || user?.role === "attendant";
  const { tables, sessionByTable, loading, error } = useLiveTables(user?.restaurantId);
  const { orders } = useLiveOrders(user?.restaurantId);
  const tablesService = useMemo(() => new TablesService({ scope: "admin" }), []);

  const [filter, setFilter] = useState<Filter>("all");
  const [now, setNow] = useState(() => Date.now());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tableForm, setTableForm] = useState<{ id: string; number: string; label: string; capacity: string } | null>(null);
  const [openForm, setOpenForm] = useState<{ table: Table; people: string; limitEnabled: boolean; limit: string; duration: string; notes: string } | null>(null);
  const [closeTarget, setCloseTarget] = useState<{ table: Table; reason: string } | null>(null);
  const [codeShown, setCodeShown] = useState<{ table: Table; code: string } | null>(null);
  const [qrTable, setQrTable] = useState<Table | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);

  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(id); }, []);

  const views = useMemo(() => Object.fromEntries(tables.map((table) => [table.id, viewOf(table, sessionByTable[table.id])])) as Record<string, TableView>, [tables, sessionByTable, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = tables.filter((table) => filter === "all" || views[table.id] === filter);
  const ordersBySession = useMemo(() => orders.reduce<Record<string, number>>((acc, order) => { acc[order.sessionId] = (acc[order.sessionId] ?? 0) + (order.status === "cancelled" ? 0 : 1); return acc; }, {}), [orders]);
  const urlProblem = typeof window === "undefined" ? null : describePublicUrlProblem();
  const summary = {
    occupied: tables.filter((table) => views[table.id] === "occupied").length,
    free: tables.filter((table) => views[table.id] === "free").length,
    expired: tables.filter((table) => views[table.id] === "expired").length,
    people: tables.filter((table) => views[table.id] === "occupied").reduce((acc, table) => acc + (sessionByTable[table.id]?.peopleCount ?? table.currentPeopleCount), 0)
  };

  useEffect(() => {
    if (!qrTable) { setQrImage(null); return; }
    void createQrDataUrl(resolvePublicTableUrl(qrTable)).then(setQrImage).catch(() => setQrImage(null));
  }, [qrTable]);

  async function run<T>(tableId: string, action: () => Promise<T>, success?: (result: T) => void): Promise<void> {
    setBusyId(tableId);
    try {
      const result = await action();
      success?.(result);
    } catch (failure) {
      appToast.error("Não foi possível concluir", failure instanceof Error ? (failure.name === "FirebaseError" ? describeFirebaseError(failure) : failure.message) : "Tente novamente.");
    } finally {
      setBusyId(null);
    }
  }

  const submitTableForm = (event: FormEvent) => {
    event.preventDefault();
    if (!tableForm || !user?.restaurantId) return;
    const number = Number(tableForm.number);
    const capacity = Number(tableForm.capacity);
    if (!Number.isInteger(number) || number < 1 || number > 9999) return appToast.error("Número inválido", "Use um número inteiro a partir de 1.");
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 20) return appToast.error("Capacidade inválida", "Use de 1 a 20 lugares.");
    if (tables.some((table) => table.number === number && table.id !== tableForm.id)) return appToast.error("Número repetido", `Já existe a Mesa ${number}.`);
    const label = (tableForm.label.trim() || `Mesa ${number}`).slice(0, 30);
    const form = tableForm;
    void run(form.id || "new", async () => {
      if (form.id) {
        await tablesService.update(form.id, { number, label, capacity });
      } else {
        const publicToken = createClientToken();
        await tablesService.create({ restaurantId: user.restaurantId, number, label, status: "free", capacity, currentPeopleCount: 0, activeSessionLimit: 1, activeSessionCount: 0, currentSessionGroupId: null, pinCode: null, publicToken, isActive: true, qrCodeValue: buildPublicTableUrl(publicToken), openedAt: null, closedAt: null });
      }
    }, () => { appToast.success(form.id ? "Mesa atualizada" : "Mesa criada", form.id ? undefined : "Abra a mesa quando os clientes chegarem."); setTableForm(null); });
  };

  const submitOpen = (event: FormEvent) => {
    event.preventDefault();
    if (!openForm) return;
    const people = Number(openForm.people);
    const limit = Number(openForm.limit);
    if (!Number.isInteger(people) || people < 1 || people > 60) return appToast.error("Quantidade inválida", "Informe de 1 a 60 pessoas.");
    if (openForm.limitEnabled && (!Number.isInteger(limit) || limit < 1 || limit > 100)) return appToast.error("Limite inválido", "Informe de 1 a 100 pedidos.");
    const target = openForm.table;
    void run(target.id, () => api<{ attendanceCode: string }>("/api/admin/table/open", {
      tableId: target.id,
      peopleCount: people,
      orderLimit: openForm.limitEnabled ? limit : null,
      ...(openForm.duration ? { durationMinutes: Number(openForm.duration) } : {}),
      ...(openForm.notes.trim() ? { notes: openForm.notes.trim() } : {})
    }), (result) => { setOpenForm(null); setCodeShown({ table: target, code: result.attendanceCode }); });
  };

  const confirmClose = () => {
    if (!closeTarget) return;
    const target = closeTarget;
    void run(target.table.id, () => api("/api/admin/table/close", { tableId: target.table.id, ...(target.reason.trim() ? { reason: target.reason.trim() } : {}) }), () => { setCloseTarget(null); appToast.success("Mesa encerrada", `${target.table.label} está livre.`); });
  };

  const renewCode = (table: Table) => void run(table.id, () => api<{ attendanceCode: string }>("/api/admin/table/code", { tableId: table.id }), (result) => setCodeShown({ table, code: result.attendanceCode }));
  const renewTime = (table: Table) => void run(table.id, () => api("/api/admin/table/session", { tableId: table.id, action: "renew" }), () => appToast.success("Atendimento renovado", "Os clientes já podem voltar a pedir."));
  const toggleActive = (table: Table) => {
    if (views[table.id] === "occupied" || views[table.id] === "expired") return appToast.error("Mesa em uso", "Encerre o atendimento antes de desativar.");
    void run(table.id, () => tablesService.update(table.id, { isActive: table.isActive === false, status: "free", currentSessionGroupId: null }), () => appToast.success(table.isActive === false ? "Mesa ativada" : "Mesa desativada"));
  };

  const copy = (text: string, what: string) => { void navigator.clipboard?.writeText(text).then(() => appToast.success(`${what} copiado`)).catch(() => appToast.info(what, text)); };

  const downloadQr = (table: Table) => {
    void createQrDataUrl(resolvePublicTableUrl(table)).then((dataUrl) => {
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `qrcode-mesa-${table.number}.png`;
      link.click();
    });
  };

  const printQr = (table: Table) => {
    void createQrDataUrl(resolvePublicTableUrl(table)).then((dataUrl) => {
      const frame = document.createElement("iframe");
      Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
      document.body.appendChild(frame);
      const doc = frame.contentDocument;
      if (!doc) { frame.remove(); return; }
      doc.open();
      doc.write(`<!doctype html><html><head><title>QR ${table.label}</title><style>@page{size:A5;margin:12mm}body{font-family:system-ui,sans-serif;text-align:center;margin:0}h1{font-size:28pt;margin:6mm 0 2mm}p{font-size:13pt;color:#333;margin:2mm 0}img{width:95mm;height:95mm}</style></head><body><h1>${table.label.replace(/</g, "&lt;")}</h1><p>Aponte a câmera do celular para ver o cardápio e pedir</p><img src="${dataUrl}" alt="QR Code"/><p>Peça ao atendente o código de 6 dígitos da mesa</p></body></html>`);
      doc.close();
      const image = doc.querySelector("img");
      const print = () => { frame.contentWindow?.focus(); frame.contentWindow?.print(); window.setTimeout(() => frame.remove(), 1000); };
      if (image && !image.complete) image.onload = print; else print();
    });
  };

  return (
    <section className="space-y-4">
      {urlProblem ? (
        <AppSurface className="flex items-start gap-3 border border-[hsl(var(--warning)/0.5)] p-4 text-sm"><TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--warning))]" /><p>{urlProblem}</p></AppSurface>
      ) : null}
      {error ? (
        <AppSurface className="flex items-start gap-3 border border-[hsl(var(--danger)/0.5)] p-4 text-sm"><TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--danger))]" /><p>{error}</p></AppSurface>
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[["Ocupadas", summary.occupied], ["Livres", summary.free], ["Tempo esgotado", summary.expired], ["Pessoas no salão", summary.people]].map(([label, value]) => (
          <AppSurface key={label} className="p-4"><p className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--foreground-muted))]">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></AppSurface>
        ))}
      </div>

      <AppFilterBar className="items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button key={item.value} type="button" onClick={() => setFilter(item.value)} className={`h-9 rounded-full border px-4 text-xs font-semibold uppercase tracking-[0.12em] transition ${filter === item.value ? "border-[hsl(var(--focus-ring)/0.45)] bg-[hsl(var(--primary)/0.2)]" : "border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))] text-[hsl(var(--foreground-muted))]"}`}>{item.label}</button>
          ))}
        </div>
        {canManageTables ? <AppActionButton className="gap-2" onClick={() => setTableForm({ id: "", number: String((tables.at(-1)?.number ?? 0) + 1), label: "", capacity: "4" })}><Plus className="h-4 w-4" />Nova mesa</AppActionButton> : null}
      </AppFilterBar>

      <AppSectionCard title="Salão" description="Atualiza sozinho. O código de cada mesa ocupada fica visível aqui para você passar aos clientes.">
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, index) => <AppSurface key={index} className="h-48 animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <AppEmptyState title={tables.length ? "Nenhuma mesa neste filtro" : "Nenhuma mesa cadastrada"} description={tables.length ? "Escolha outro filtro." : "Crie a primeira mesa em \"Nova mesa\" e imprima o QR Code dela."} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {filtered.map((table) => {
              const view = views[table.id];
              const meta = VIEW_META[view];
              const session = sessionByTable[table.id];
              const busy = busyId === table.id;
              const qrBroken = !isValidPublicTableToken(table.publicToken);
              return (
                <article key={table.id} className={`flex flex-col gap-3 rounded-2xl border p-4 ${meta.accent}`}>
                  <header className="flex items-start justify-between gap-3">
                    <div><p className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--foreground-muted))]">Mesa {table.number}</p><h3 className="text-xl font-semibold">{table.label}</h3></div>
                    <AppStatusBadge tone={meta.tone}>{meta.label}</AppStatusBadge>
                  </header>

                  {session && view !== "free" ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--background-elevated))] px-3 py-2">
                        <div><p className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--foreground-muted))]">Código da mesa</p><p className="font-mono text-2xl font-semibold tracking-[0.2em]">{formatCode(session.staffAccessCode)}</p></div>
                        <div className="flex gap-1">
                          {session.staffAccessCode ? <button type="button" onClick={() => copy(session.staffAccessCode ?? "", "Código")} className="rounded-lg p-2 hover:bg-[hsl(var(--surface-muted))]" aria-label="Copiar código"><Copy className="h-4 w-4" /></button> : null}
                        </div>
                      </div>
                      {!session.staffAccessCode && view === "occupied" ? <p className="text-xs text-[hsl(var(--foreground-muted))]">Mesa aberta por uma versão anterior: gere um novo código para ver aqui.</p> : null}
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[hsl(var(--foreground-muted))]">
                        <span className="inline-flex items-center gap-1"><Users className="h-4 w-4" />{session.peopleCount} pessoa(s)</span>
                        <span className="inline-flex items-center gap-1"><Clock3 className="h-4 w-4" />aberta {formatTime(session.startedAt)} · {remaining(session, now)}</span>
                        <span>{ordersBySession[session.id] ?? 0} pedido(s){session.orderLimitEnabled ? ` de ${session.maxOrdersAllowed}` : ""}</span>
                      </p>
                    </div>
                  ) : view === "expired" ? (
                    <p className="text-sm text-[hsl(var(--foreground-muted))]">Mesa marcada como ocupada sem atendimento válido. Encerre para liberar.</p>
                  ) : (
                    <p className="text-sm text-[hsl(var(--foreground-muted))]">{table.capacity} lugares{qrBroken ? " · QR Code inválido: use Diagnóstico → Corrigir" : ""}</p>
                  )}

                  <div className="mt-auto flex flex-wrap gap-2">
                    {canOperate && view === "free" ? <AppActionButton className="gap-2" disabled={busy} onClick={() => setOpenForm({ table, people: "2", limitEnabled: false, limit: "5", duration: "", notes: "" })}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorOpen className="h-4 w-4" />}Abrir mesa</AppActionButton> : null}
                    {canOperate && view === "occupied" ? <AppActionButton variant="secondary" className="gap-2" disabled={busy} onClick={() => renewCode(table)}><KeyRound className="h-4 w-4" />Novo código</AppActionButton> : null}
                    {canOperate && view === "expired" && session ? <AppActionButton className="gap-2" disabled={busy} onClick={() => renewTime(table)}><RefreshCw className="h-4 w-4" />Renovar</AppActionButton> : null}
                    {canOperate && (view === "occupied" || view === "expired") ? <AppActionButton variant="destructive" className="gap-2" disabled={busy} onClick={() => setCloseTarget({ table, reason: "" })}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorClosed className="h-4 w-4" />}Encerrar</AppActionButton> : null}
                    <AppActionButton variant="secondary" className="gap-2" onClick={() => setQrTable(table)} disabled={qrBroken}><QrCode className="h-4 w-4" />QR Code</AppActionButton>
                    {canManageTables ? <AppActionButton variant="ghost" className="gap-2" onClick={() => setTableForm({ id: table.id, number: String(table.number), label: table.label, capacity: String(table.capacity) })}><Edit2 className="h-4 w-4" />Editar</AppActionButton> : null}
                    {canManageTables && (view === "free" || view === "disabled") ? <AppActionButton variant="ghost" className="gap-2" disabled={busy} onClick={() => toggleActive(table)}><Power className="h-4 w-4" />{table.isActive === false ? "Ativar" : "Desativar"}</AppActionButton> : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </AppSectionCard>

      {tableForm ? (
        <Modal title={tableForm.id ? "Editar mesa" : "Nova mesa"} onClose={() => setTableForm(null)}>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={submitTableForm}>
            <AppFormField label="Número"><AppTextInput type="number" min={1} value={tableForm.number} onChange={(event) => setTableForm({ ...tableForm, number: event.target.value })} required /></AppFormField>
            <AppFormField label="Lugares"><AppTextInput type="number" min={1} max={20} value={tableForm.capacity} onChange={(event) => setTableForm({ ...tableForm, capacity: event.target.value })} required /></AppFormField>
            <div className="sm:col-span-2"><AppFormField label="Nome (opcional)" hint="Ex.: Varanda 5. Até 30 caracteres."><AppTextInput maxLength={30} value={tableForm.label} onChange={(event) => setTableForm({ ...tableForm, label: event.target.value })} placeholder={`Mesa ${tableForm.number || ""}`} /></AppFormField></div>
            <div className="flex justify-end gap-2 sm:col-span-2"><AppActionButton variant="secondary" onClick={() => setTableForm(null)}>Cancelar</AppActionButton><AppActionButton type="submit" disabled={busyId !== null}>Salvar</AppActionButton></div>
          </form>
        </Modal>
      ) : null}

      {openForm ? (
        <Modal title={`Abrir ${openForm.table.label}`} onClose={() => setOpenForm(null)}>
          <form className="space-y-4" onSubmit={submitOpen}>
            <AppFormField label="Quantas pessoas?"><AppTextInput type="number" min={1} max={60} value={openForm.people} onChange={(event) => setOpenForm({ ...openForm, people: event.target.value })} required /></AppFormField>
            <AppFormField label="Duração do atendimento" hint="Depois desse tempo, novos pedidos ficam pausados até você renovar."><AppSelect value={openForm.duration} onChange={(event) => setOpenForm({ ...openForm, duration: event.target.value })}>{DURATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</AppSelect></AppFormField>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={openForm.limitEnabled} onChange={(event) => setOpenForm({ ...openForm, limitEnabled: event.target.checked })} />Limitar a quantidade de pedidos desta mesa</label>
            {openForm.limitEnabled ? <AppFormField label="Máximo de pedidos"><AppTextInput type="number" min={1} max={100} value={openForm.limit} onChange={(event) => setOpenForm({ ...openForm, limit: event.target.value })} /></AppFormField> : null}
            <AppFormField label="Observação para a equipe (opcional)"><AppTextarea maxLength={500} value={openForm.notes} onChange={(event) => setOpenForm({ ...openForm, notes: event.target.value })} placeholder="Ex.: aniversário, cliente com alergia..." /></AppFormField>
            <p className="text-sm text-[hsl(var(--foreground-muted))]">Ao abrir, o sistema gera um código de 6 dígitos. Passe-o aos clientes: ele fica visível no card da mesa.</p>
            <div className="flex justify-end gap-2"><AppActionButton variant="secondary" onClick={() => setOpenForm(null)}>Cancelar</AppActionButton><AppActionButton type="submit" className="gap-2" disabled={busyId === openForm.table.id}>{busyId === openForm.table.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Abrir mesa</AppActionButton></div>
          </form>
        </Modal>
      ) : null}

      {codeShown ? (
        <Modal title={`${codeShown.table.label} aberta`} onClose={() => setCodeShown(null)}>
          <div className="space-y-3 text-center">
            <p className="text-sm text-[hsl(var(--foreground-muted))]">Passe este código aos clientes. Eles leem o QR da mesa e digitam o código no celular.</p>
            <p className="font-mono text-5xl font-semibold tracking-[0.25em]">{formatCode(codeShown.code)}</p>
            <p className="text-xs text-[hsl(var(--foreground-muted))]">O código continua visível no card da mesa enquanto ela estiver aberta.</p>
            <AppActionButton className="w-full" onClick={() => setCodeShown(null)}>Pronto</AppActionButton>
          </div>
        </Modal>
      ) : null}

      {closeTarget ? (
        <Modal title={`Encerrar ${closeTarget.table.label}?`} onClose={() => setCloseTarget(null)}>
          <p className="text-sm text-[hsl(var(--foreground-muted))]">Os celulares da mesa deixam de fazer pedidos e a mesa fica livre. Pedidos em andamento precisam ser entregues ou cancelados antes.</p>
          <AppTextInput value={closeTarget.reason} maxLength={300} onChange={(event) => setCloseTarget({ ...closeTarget, reason: event.target.value })} placeholder="Motivo (opcional), ex.: conta paga" />
          <div className="flex justify-end gap-2"><AppActionButton variant="secondary" onClick={() => setCloseTarget(null)}>Voltar</AppActionButton><AppActionButton variant="destructive" disabled={busyId === closeTarget.table.id} onClick={confirmClose}>Encerrar mesa</AppActionButton></div>
        </Modal>
      ) : null}

      {qrTable ? (
        <Modal title={`QR Code · ${qrTable.label}`} onClose={() => setQrTable(null)}>
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-2xl bg-white p-3">{qrImage ? <Image src={qrImage} alt={`QR Code da ${qrTable.label}`} width={220} height={220} unoptimized /> : <div className="h-[220px] w-[220px] animate-pulse rounded-xl bg-gray-100" />}</div>
            <p className="break-all text-center text-xs text-[hsl(var(--foreground-muted))]">{resolvePublicTableUrl(qrTable)}</p>
            {urlProblem ? <p className="text-center text-xs text-[hsl(var(--warning))]">{urlProblem}</p> : null}
            <p className="text-center text-sm text-[hsl(var(--foreground-muted))]">O QR é fixo: imprima uma vez e deixe na mesa. A cada abertura, só o código de 6 dígitos muda.</p>
            <div className="flex flex-wrap justify-center gap-2">
              <AppActionButton variant="secondary" className="gap-2" onClick={() => printQr(qrTable)}><Printer className="h-4 w-4" />Imprimir</AppActionButton>
              <AppActionButton variant="secondary" className="gap-2" onClick={() => downloadQr(qrTable)}><Download className="h-4 w-4" />Baixar</AppActionButton>
              <AppActionButton variant="secondary" className="gap-2" onClick={() => copy(resolvePublicTableUrl(qrTable), "Link")}><Copy className="h-4 w-4" />Copiar link</AppActionButton>
              <AppActionButton variant="ghost" className="gap-2" onClick={() => window.open(resolvePublicTableUrl(qrTable), "_blank", "noopener")}><ExternalLink className="h-4 w-4" />Testar</AppActionButton>
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
