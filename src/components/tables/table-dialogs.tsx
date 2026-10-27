"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Banknote, CheckCircle2, Copy, CreditCard, Download, ExternalLink, Loader2, Printer, QrCode, Smartphone, TriangleAlert } from "lucide-react";

import { AppActionButton, AppFormField, AppSelect, AppTextInput, AppTextarea } from "@/components/ui/app-design-system";
import { AppModal } from "@/components/ui/app-modal";
import { paymentMethodLabels } from "@/lib/constants/status-labels";
import { describeFirebaseError } from "@/lib/data/errors";
import { TablesService } from "@/lib/data/services/tables-service";
import { AdminApiError, useAdminApi } from "@/lib/hooks/use-admin-api";
import type { PaymentMethod, Table } from "@/lib/types/domain";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/formatters";
import { createQrDataUrl } from "@/lib/utils/qr";
import { buildPublicTableUrl, describePublicUrlProblem, resolvePublicTableUrl } from "@/lib/utils/public-url";
import { formatAccessCode } from "@/lib/utils/table-view";
import { appToast } from "@/lib/utils/toast";

const errorText = (failure: unknown) => (failure instanceof Error ? (failure.name === "FirebaseError" ? describeFirebaseError(failure) : failure.message) : "Tente novamente.");

function createClientToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/* ---------- Nova mesa / Editar mesa ---------- */

export function TableFormDialog({ table, tables, restaurantId, onClose }: { table: Table | null; tables: Table[]; restaurantId: string; onClose: () => void }): JSX.Element {
  const service = useMemo(() => new TablesService({ scope: "admin" }), []);
  const nextNumber = Math.max(0, ...tables.filter((item) => !item.archivedAt).map((item) => item.number)) + 1;
  const [form, setForm] = useState({ number: String(table?.number ?? nextNumber), label: table?.label ?? "", capacity: String(table?.capacity ?? 4) });
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const number = Number(form.number);
    const capacity = Number(form.capacity);
    if (!Number.isInteger(number) || number < 1 || number > 9999) return appToast.error("Número inválido", "Use um número inteiro a partir de 1.");
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 20) return appToast.error("Lugares inválidos", "Use de 1 a 20 lugares.");
    if (tables.some((item) => item.number === number && item.id !== table?.id && !item.archivedAt)) return appToast.error("Número repetido", `Já existe a Mesa ${number}.`);
    const label = (form.label.trim() || `Mesa ${number}`).slice(0, 30);
    setBusy(true);
    try {
      if (table) {
        await service.update(table.id, { number, label, capacity });
        appToast.success("Mesa atualizada");
      } else {
        const publicToken = createClientToken();
        await service.create({ restaurantId, number, label, status: "free", capacity, currentPeopleCount: 0, activeSessionLimit: 1, activeSessionCount: 0, currentSessionGroupId: null, pinCode: null, publicToken, isActive: true, qrCodeValue: buildPublicTableUrl(publicToken), openedAt: null, closedAt: null });
        appToast.success("Mesa criada", "Imprima o QR Code e cole na mesa.");
      }
      onClose();
    } catch (failure) {
      appToast.error("Não foi possível salvar", errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppModal title={table ? `Editar ${table.label}` : "Nova mesa"} onClose={onClose}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
        <AppFormField label="Número"><AppTextInput type="number" inputMode="numeric" min={1} value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} required /></AppFormField>
        <AppFormField label="Lugares"><AppTextInput type="number" inputMode="numeric" min={1} max={20} value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} required /></AppFormField>
        <div className="sm:col-span-2"><AppFormField label="Nome (opcional)" hint="Ex.: Varanda 5. Até 30 caracteres."><AppTextInput maxLength={30} value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} placeholder={`Mesa ${form.number || ""}`} /></AppFormField></div>
        <div className="flex justify-end gap-2 sm:col-span-2"><AppActionButton variant="secondary" onClick={onClose}>Cancelar</AppActionButton><AppActionButton type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Salvar</AppActionButton></div>
      </form>
    </AppModal>
  );
}

/* ---------- Abrir mesa ---------- */

const DURATION_OPTIONS = [
  { value: "", label: "Padrão do restaurante" },
  { value: "120", label: "2 horas" },
  { value: "240", label: "4 horas" },
  { value: "360", label: "6 horas" },
  { value: "720", label: "12 horas" }
];

export function OpenTableDialog({ table, onClose, onOpened }: { table: Table; onClose: () => void; onOpened: (code: string) => void }): JSX.Element {
  const api = useAdminApi();
  const [form, setForm] = useState({ people: String(Math.min(table.capacity || 2, 2)), limitEnabled: false, limit: "5", duration: "", notes: "" });
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const people = Number(form.people);
    const limit = Number(form.limit);
    if (!Number.isInteger(people) || people < 1 || people > 60) return appToast.error("Quantidade inválida", "Informe de 1 a 60 pessoas.");
    if (form.limitEnabled && (!Number.isInteger(limit) || limit < 1 || limit > 100)) return appToast.error("Limite inválido", "Informe de 1 a 100 pedidos.");
    setBusy(true);
    try {
      const result = await api<{ attendanceCode: string }>("/api/admin/table/open", {
        tableId: table.id,
        peopleCount: people,
        orderLimit: form.limitEnabled ? limit : null,
        ...(form.duration ? { durationMinutes: Number(form.duration) } : {}),
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {})
      });
      onOpened(result.attendanceCode);
    } catch (failure) {
      appToast.error("Não foi possível abrir", errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppModal title={`Abrir ${table.label}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <AppFormField label="Quantas pessoas?">
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6].map((count) => (
              <button key={count} type="button" onClick={() => setForm({ ...form, people: String(count) })} className={cn("num h-11 w-11 rounded-[var(--radius-md)] border text-base font-semibold", form.people === String(count) ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" : "border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))]")}>{count}</button>
            ))}
            <AppTextInput aria-label="Outra quantidade" className="w-20" type="number" inputMode="numeric" min={1} max={60} value={form.people} onChange={(event) => setForm({ ...form, people: event.target.value })} />
          </div>
        </AppFormField>
        <details className="rounded-[var(--radius-md)] border border-[hsl(var(--border))] p-3 text-sm">
          <summary className="cursor-pointer font-medium">Mais opções</summary>
          <div className="mt-3 space-y-3">
            <AppFormField label="Duração do atendimento" hint="Depois desse tempo, novos pedidos ficam pausados até você renovar."><AppSelect value={form.duration} onChange={(event) => setForm({ ...form, duration: event.target.value })}>{DURATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</AppSelect></AppFormField>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.limitEnabled} onChange={(event) => setForm({ ...form, limitEnabled: event.target.checked })} />Limitar a quantidade de pedidos desta mesa</label>
            {form.limitEnabled ? <AppFormField label="Máximo de pedidos"><AppTextInput type="number" min={1} max={100} value={form.limit} onChange={(event) => setForm({ ...form, limit: event.target.value })} /></AppFormField> : null}
            <AppFormField label="Observação para a equipe"><AppTextarea maxLength={500} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Ex.: aniversário, cliente com alergia..." /></AppFormField>
          </div>
        </details>
        <AppActionButton type="submit" className="h-12 w-full text-base" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}Abrir mesa</AppActionButton>
      </form>
    </AppModal>
  );
}

/* ---------- Código gerado ---------- */

export function CodeDialog({ table, code, onClose }: { table: Table; code: string; onClose: () => void }): JSX.Element {
  return (
    <AppModal title={`${table.label} aberta`} onClose={onClose}>
      <div className="space-y-3 text-center">
        <p className="text-sm text-[hsl(var(--foreground-muted))]">Passe este código aos clientes. Eles escaneiam o QR da mesa e digitam o código no celular.</p>
        <p className="num text-5xl font-bold tracking-[0.2em]">{formatAccessCode(code)}</p>
        <p className="text-xs text-[hsl(var(--foreground-muted))]">O código fica visível na mesa, aqui no painel, enquanto ela estiver aberta.</p>
        <AppActionButton className="h-12 w-full" onClick={onClose}>Pronto</AppActionButton>
      </div>
    </AppModal>
  );
}

/* ---------- Receber e encerrar ---------- */

const PAY_OPTIONS: Array<{ value: PaymentMethod; icon: typeof Banknote }> = [
  { value: "pix", icon: Smartphone },
  { value: "cash", icon: Banknote },
  { value: "debit_card", icon: CreditCard },
  { value: "credit_card", icon: CreditCard }
];

export function CloseTableDialog({ table, total, suggestedMethod, hasSession, onClose, onClosed }: { table: Table; total: number | null; suggestedMethod: PaymentMethod | null; hasSession: boolean; onClose: () => void; onClosed?: () => void }): JSX.Element {
  const api = useAdminApi();
  const initial = PAY_OPTIONS.some((option) => option.value === suggestedMethod) ? suggestedMethod : null;
  const [paidWith, setPaidWith] = useState<PaymentMethod | null>(initial);
  const [noCharge, setNoCharge] = useState(!hasSession || total === 0);
  const [reason, setReason] = useState("");
  const [kitchenPending, setKitchenPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!noCharge && !paidWith) return appToast.error("Como foi pago?", "Escolha a forma de pagamento ou marque \"Sem cobrança\".");
    setBusy(true);
    try {
      await api("/api/admin/table/close", {
        tableId: table.id,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        ...(kitchenPending ? { force: true } : {}),
        ...(!noCharge && paidWith ? { paidWith } : {})
      });
      appToast.success(`${table.label} livre`, !noCharge && total ? `Recebido ${formatCurrency(total)} (${paymentMethodLabels[paidWith!]}).` : undefined);
      onClosed?.();
      onClose();
    } catch (failure) {
      if (failure instanceof AdminApiError && failure.code === "kitchen_pending") setKitchenPending(failure.message);
      else appToast.error("Não foi possível encerrar", errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppModal title={hasSession ? `Fechar conta · ${table.label}` : `Liberar ${table.label}`} onClose={onClose}>
      {hasSession && total !== null ? (
        <div className="rounded-[var(--radius-md)] bg-[hsl(var(--surface-muted))] p-4 text-center">
          <p className="text-sm text-[hsl(var(--foreground-muted))]">Total da mesa</p>
          <p className="num text-4xl font-bold">{formatCurrency(total)}</p>
        </div>
      ) : null}
      {hasSession ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Como foi pago?</p>
          <div className="grid grid-cols-2 gap-2">
            {PAY_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = !noCharge && paidWith === option.value;
              return (
                <button key={option.value} type="button" onClick={() => { setPaidWith(option.value); setNoCharge(false); }} className={cn("flex h-12 items-center justify-center gap-2 rounded-[var(--radius-md)] border text-sm font-semibold", active ? "border-[hsl(var(--success))] bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]" : "border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))]")}>
                  <Icon className="h-4 w-4" />{paymentMethodLabels[option.value]}
                </button>
              );
            })}
          </div>
          <label className="flex items-center gap-2 text-sm text-[hsl(var(--foreground-muted))]"><input type="checkbox" checked={noCharge} onChange={(event) => setNoCharge(event.target.checked)} />Sem cobrança (cortesia, mesa aberta por engano...)</label>
        </div>
      ) : (
        <p className="text-sm text-[hsl(var(--foreground-muted))]">A mesa está marcada como ocupada, mas sem atendimento válido. Liberar deixa ela livre de novo.</p>
      )}
      {kitchenPending ? <p className="flex gap-2 rounded-[var(--radius-md)] border border-[hsl(var(--warning)/0.5)] bg-[hsl(var(--gema)/0.12)] p-3 text-sm"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />{kitchenPending}</p> : null}
      <AppTextInput value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} placeholder="Observação (opcional)" />
      <p className="text-xs text-[hsl(var(--foreground-muted))]">Ao encerrar, os celulares da mesa param de pedir, o que estava pronto fica como entregue e a mesa fica livre.</p>
      <div className="flex justify-end gap-2">
        <AppActionButton variant="secondary" onClick={onClose}>Voltar</AppActionButton>
        <AppActionButton variant={kitchenPending ? "destructive" : "success"} className="min-w-40" disabled={busy} onClick={() => void submit()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{kitchenPending ? "Encerrar mesmo assim" : hasSession && !noCharge ? "Recebido, encerrar" : "Encerrar mesa"}</AppActionButton>
      </div>
    </AppModal>
  );
}

/* ---------- Excluir (arquivar) ---------- */

export function ArchiveTableDialog({ table, onClose, onArchived }: { table: Table; onClose: () => void; onArchived?: () => void }): JSX.Element {
  const api = useAdminApi();
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try {
      await api("/api/admin/table/archive", { tableId: table.id, archived: true });
      appToast.success("Mesa excluída", "O histórico continua em Mesas → Excluídas.");
      onArchived?.();
      onClose();
    } catch (failure) {
      appToast.error("Não foi possível excluir", errorText(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AppModal title={`Excluir ${table.label}?`} onClose={onClose}>
      <p className="text-sm text-[hsl(var(--foreground-muted))]">A mesa sai do salão e o QR Code dela para de funcionar. O histórico de pedidos é mantido e você pode restaurá-la em Mesas → Excluídas.</p>
      <div className="flex justify-end gap-2"><AppActionButton variant="secondary" onClick={onClose}>Voltar</AppActionButton><AppActionButton variant="destructive" disabled={busy} onClick={() => void confirm()}>Excluir mesa</AppActionButton></div>
    </AppModal>
  );
}

/* ---------- QR Code ---------- */

export function printTableQr(table: Table): void {
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
}

export function QrDialog({ table, onClose }: { table: Table; onClose: () => void }): JSX.Element {
  const [image, setImage] = useState<string | null>(null);
  const [urlProblem, setUrlProblem] = useState<string | null>(null);
  const url = resolvePublicTableUrl(table);
  useEffect(() => { setUrlProblem(describePublicUrlProblem()); void createQrDataUrl(url).then(setImage).catch(() => setImage(null)); }, [url]);

  const download = () => {
    if (!image) return;
    const link = document.createElement("a");
    link.href = image;
    link.download = `qrcode-mesa-${table.number}.png`;
    link.click();
  };
  const copy = () => { void navigator.clipboard?.writeText(url).then(() => appToast.success("Link copiado")).catch(() => appToast.info("Link", url)); };

  return (
    <AppModal title={`QR Code · ${table.label}`} onClose={onClose}>
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-2xl bg-white p-3">{image ? <Image src={image} alt={`QR Code da ${table.label}`} width={220} height={220} unoptimized /> : <div className="flex h-[220px] w-[220px] items-center justify-center rounded-xl bg-neutral-100"><QrCode className="h-10 w-10 animate-pulse text-neutral-400" /></div>}</div>
        <p className="break-all text-center text-xs text-[hsl(var(--foreground-muted))]">{url}</p>
        {urlProblem ? <p className="text-center text-xs text-[hsl(var(--warning))]">{urlProblem}</p> : null}
        <p className="text-center text-sm text-[hsl(var(--foreground-muted))]">O QR é fixo: imprima uma vez e cole na mesa. A cada abertura, só o código de 6 dígitos muda.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <AppActionButton className="gap-2" onClick={() => printTableQr(table)}><Printer className="h-4 w-4" />Imprimir</AppActionButton>
          <AppActionButton variant="secondary" className="gap-2" onClick={download}><Download className="h-4 w-4" />Baixar</AppActionButton>
          <AppActionButton variant="secondary" className="gap-2" onClick={copy}><Copy className="h-4 w-4" />Copiar link</AppActionButton>
          <AppActionButton variant="ghost" className="gap-2" onClick={() => window.open(url, "_blank", "noopener")}><ExternalLink className="h-4 w-4" />Testar</AppActionButton>
        </div>
      </div>
    </AppModal>
  );
}
