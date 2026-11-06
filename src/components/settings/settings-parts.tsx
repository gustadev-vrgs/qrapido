"use client";

import { useState, type ReactNode } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { AppActionButton, AppTextInput } from "@/components/ui/app-design-system";
import { AppModal } from "@/components/ui/app-modal";
import type { useAdminApi } from "@/lib/hooks/use-admin-api";
import { cn } from "@/lib/utils/cn";
import { toRestaurantDateKey } from "@/lib/utils/date-key";
import { appToast } from "@/lib/utils/toast";

/** One settings block: title and short explanation on top, fields below. */
export function SettingsSection({ id, title, description, children, tone = "default" }: { id: string; title: string; description?: string; children: ReactNode; tone?: "default" | "danger" }): JSX.Element {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-24 rounded-[var(--radius-lg)] border bg-[hsl(var(--surface))] p-4 md:p-6", tone === "danger" ? "border-[hsl(var(--danger)/0.35)]" : "border-[hsl(var(--border))]")}>
      <header className="mb-5 max-w-prose">
        <h2 id={`${id}-title`} className={cn("text-lg", tone === "danger" && "text-[hsl(var(--danger))]")}>{title}</h2>
        {description ? <p className="mt-1 text-sm text-[hsl(var(--foreground-muted))]">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

/** On/off switch with its explanation, laid out as a row. */
export function ToggleRow({ label, description, checked, onChange, disabled }: { label: string; description?: string; checked: boolean; onChange: (next: boolean) => void; disabled?: boolean }): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        {description ? <p className="text-sm text-[hsl(var(--foreground-muted))]">{description}</p> : null}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} disabled={disabled} />
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--focus-ring)/0.5)] focus-visible:ring-offset-2 disabled:opacity-50",
        checked ? "bg-[hsl(var(--primary))]" : "bg-[hsl(var(--border-strong))]"
      )}
    >
      <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
    </button>
  );
}

type AdminApi = ReturnType<typeof useAdminApi>;
type Period = "all" | "yesterday" | "date";
interface PurgeResult { tables: number; orders: number; other: number; receiptsRestarted: boolean; more: boolean }

/**
 * Test-data cleanup (admin only). Deletes closed tables with their orders, receipts and
 * history up to a chosen day, after the person types APAGAR. Repeats the server call
 * while there is more to delete, so a single confirmation clears everything chosen.
 */
export function PurgeTestData({ api }: { api: AdminApi }): JSX.Element {
  const today = toRestaurantDateKey();
  const [period, setPeriod] = useState<Period>("all");
  const [date, setDate] = useState(today);
  const [restartNumbers, setRestartNumbers] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [running, setRunning] = useState(false);

  const until = period === "all" ? null : period === "yesterday" ? toRestaurantDateKey(new Date(Date.now() - 86_400_000)) : date;
  const periodText = until ? `fechadas até ${until.split("-").reverse().join("/")}` : "já fechadas, de qualquer data";

  const run = async () => {
    setRunning(true);
    const total = { tables: 0, orders: 0 };
    try {
      let result: PurgeResult;
      let rounds = 0;
      do {
        result = await api<PurgeResult>("/api/admin/operations/purge-orders", { until, confirm: typed, resetReceiptNumbers: until === null && restartNumbers });
        total.tables += result.tables;
        total.orders += result.orders;
        rounds += 1;
      } while (result.more && rounds < 20);
      setConfirming(false);
      setTyped("");
      if (total.tables === 0 && !result.receiptsRestarted) {
        appToast.info("Nada para apagar", "Não há mesas fechadas nesse período.");
      } else {
        appToast.success("Pedidos apagados", `${total.orders} pedido(s) de ${total.tables} mesa(s).${result.receiptsRestarted ? " O próximo recibo será o nº 1." : ""}${result.more ? " Ainda restam alguns: clique de novo para continuar." : ""}`);
      }
    } catch (failure) {
      appToast.error("Não foi possível apagar", failure instanceof Error ? failure.message : "Tente novamente.");
    } finally {
      setRunning(false);
    }
  };

  const options: Array<{ value: Period; label: string }> = [
    { value: "all", label: "Tudo" },
    { value: "yesterday", label: "Até ontem" },
    { value: "date", label: "Até uma data" }
  ];

  return (
    <div className="space-y-4">
      <ul className="grid gap-2 text-sm sm:grid-cols-2">
        <li className="rounded-[var(--radius-md)] bg-[hsl(var(--danger)/0.06)] p-3"><span className="font-semibold">Apaga:</span> mesas já fechadas, com os pedidos, recibos, chamados de garçom e histórico delas.</li>
        <li className="rounded-[var(--radius-md)] bg-[hsl(var(--surface-muted))] p-3"><span className="font-semibold">Fica:</span> mesas abertas agora, cardápio, mesas, equipe, configurações e o registro de quem fez a limpeza.</li>
      </ul>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold">Quais mesas fechadas</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {options.map((option) => (
            <button key={option.value} type="button" role="radio" aria-checked={period === option.value} onClick={() => setPeriod(option.value)} className={cn("h-9 rounded-full border px-4 text-sm font-semibold", period === option.value ? "border-[hsl(var(--foreground))] bg-[hsl(var(--foreground))] text-[hsl(var(--background))]" : "border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))]")}>
              {option.label}
            </button>
          ))}
          {period === "date" ? <AppTextInput type="date" aria-label="Apagar mesas fechadas até o dia" value={date} max={today} onChange={(event) => setDate(event.target.value || today)} className="h-9 w-auto" /> : null}
        </div>
      </fieldset>

      <label className={cn("flex items-start gap-2 text-sm", until !== null && "opacity-50")}>
        <input type="checkbox" className="mt-1" checked={until === null && restartNumbers} disabled={until !== null} onChange={(event) => setRestartNumbers(event.target.checked)} />
        <span>Recomeçar a numeração dos recibos do nº 1 <span className="block text-[hsl(var(--foreground-muted))]">Só com “Tudo”, para começar o uso real do zero.</span></span>
      </label>

      <AppActionButton variant="destructive" onClick={() => setConfirming(true)}>
        <Trash2 className="h-4 w-4" /> Apagar pedidos concluídos
      </AppActionButton>

      {confirming ? (
        <AppModal title="Apagar pedidos concluídos?" onClose={() => { if (!running) { setConfirming(false); setTyped(""); } }}>
          <p className="text-sm">Vão ser apagadas as mesas {periodText}, com todos os pedidos e recibos delas. <strong>Não dá para desfazer.</strong></p>
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold">Digite APAGAR para confirmar</span>
            <AppTextInput autoFocus autoComplete="off" value={typed} onChange={(event) => setTyped(event.target.value)} placeholder="APAGAR" />
          </label>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AppActionButton variant="secondary" onClick={() => { setConfirming(false); setTyped(""); }} disabled={running}>Cancelar</AppActionButton>
            <AppActionButton variant="destructive" onClick={run} disabled={running || typed.trim().toUpperCase() !== "APAGAR"} className="bg-[hsl(var(--danger))] text-white hover:bg-[hsl(var(--danger)/0.9)]">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} {running ? "Apagando..." : "Apagar agora"}
            </AppActionButton>
          </div>
        </AppModal>
      ) : null}
    </div>
  );
}
