"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, ChevronDown, Download } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/formatters";
import type { Comparison } from "@/lib/utils/report-calculations";

/** Reads a theme color token so the SVG chart follows light/dark mode. */
function useThemeColor(token: string, fallback: string): string {
  const [color, setColor] = useState(fallback);
  useEffect(() => {
    const read = () => {
      const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
      if (value) setColor(`hsl(${value})`);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => observer.disconnect();
  }, [token]);
  return color;
}

/** Headline number with a short label; optional comparison with the previous period. */
export function Kpi({ label, value, note, comparison }: { label: string; value: string; note?: string; comparison?: Comparison }): JSX.Element {
  const rounded = comparison?.percent == null ? null : Math.round(comparison.percent);
  const up = rounded !== null && rounded > 0;
  const down = rounded !== null && rounded < 0;
  return (
    <div className="min-w-0 rounded-[var(--radius-lg)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-3 sm:p-4">
      <p className="text-sm text-[hsl(var(--foreground-muted))]">{label}</p>
      <p className="mt-1 truncate text-xl sm:text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {rounded !== null ? (
        <p className={cn("mt-1 inline-flex items-center gap-1 text-xs font-semibold", up && "text-[hsl(var(--success))]", down && "text-[hsl(var(--danger))]", !up && !down && "text-[hsl(var(--foreground-muted))]")}>
          {up ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> : down ? <ArrowDownRight className="h-3.5 w-3.5" aria-hidden /> : null}
          {up ? "+" : ""}{rounded}% <span className="font-normal text-[hsl(var(--foreground-muted))]">vs. período anterior</span>
        </p>
      ) : note ? <p className="mt-1 text-xs text-[hsl(var(--foreground-muted))]">{note}</p> : null}
    </div>
  );
}

/** Block inside a report tab. */
export function ReportBlock({ title, description, action, children, className }: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }): JSX.Element {
  return (
    <section className={cn("rounded-[var(--radius-lg)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4 md:p-5 print:break-inside-avoid", className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-[hsl(var(--foreground-muted))]">{description}</p> : null}
        </div>
        {action ? <div className="print:hidden">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}

/** Ranked list with a proportional bar under each name (one hue: it shows size, not identity). */
export function ShareList({ rows, empty }: { rows: Array<{ key: string; label: string; detail?: string; value: string; share: number }>; empty: string }): JSX.Element {
  if (!rows.length) return <p className="text-sm text-[hsl(var(--foreground-muted))]">{empty}</p>;
  const max = Math.max(...rows.map((row) => row.share), 1);
  return (
    <ol className="space-y-3">
      {rows.map((row) => (
        <li key={row.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">{row.label}{row.detail ? <span className="ml-1.5 font-normal text-[hsl(var(--foreground-muted))]">{row.detail}</span> : null}</span>
            <span className="shrink-0 tabular-nums">{row.value}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-[hsl(var(--surface-muted))]" aria-hidden>
            <div className="h-full rounded-full bg-[hsl(var(--primary))]" style={{ width: `${Math.max(2, (row.share / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Revenue per hour/day/month. One series, one axis, tooltip on hover. */
export function RevenueChart({ data }: { data: Array<{ label: string; faturamento: number; pedidos: number }> }): JSX.Element {
  const bar = useThemeColor("--primary", "#1e3a8a");
  const grid = useThemeColor("--border", "#e5e7eb");
  const muted = useThemeColor("--foreground-muted", "#6b7280");
  if (!data.length) return <p className="py-10 text-center text-sm text-[hsl(var(--foreground-muted))]">Sem vendas entregues neste período.</p>;
  return (
    <div className="h-64" role="img" aria-label={`Faturamento: ${data.map((item) => `${item.label} ${formatCurrency(item.faturamento)}`).join(", ")}`}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={grid} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: muted, fontSize: 12 }} minTickGap={8} />
          <YAxis tickLine={false} axisLine={false} width={64} tick={{ fill: muted, fontSize: 12 }} tickFormatter={(value: number) => (value >= 1000 ? `R$ ${(value / 1000).toFixed(1).replace(".", ",")} mil` : `R$ ${value}`)} />
          <Tooltip
            cursor={{ fill: grid, opacity: 0.5 }}
            content={({ active, payload }) => {
              const item = active && payload?.length ? (payload[0].payload as { label: string; faturamento: number; pedidos: number }) : null;
              return item ? (
                <div className="rounded-[var(--radius-md)] border border-[hsl(var(--border-strong))] bg-[hsl(var(--background-elevated))] px-3 py-2 text-sm shadow-lg">
                  <p className="font-semibold">{item.label}</p>
                  <p className="tabular-nums">{formatCurrency(item.faturamento)}</p>
                  <p className="text-xs text-[hsl(var(--foreground-muted))]">{item.pedidos} pedido(s)</p>
                </div>
              ) : null;
            }}
          />
          <Bar dataKey="faturamento" name="Faturamento" fill={bar} radius={[4, 4, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** "Baixar planilha" button with a small menu of report lists. */
export function ExportMenu({ options, onPick }: { options: Array<{ value: string; label: string }>; onPick: (value: string) => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] px-3 text-sm font-semibold hover:bg-[hsl(var(--surface-muted))]">
        <Download className="h-4 w-4" /> Baixar planilha <ChevronDown className="h-4 w-4" />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-52 rounded-[var(--radius-md)] border border-[hsl(var(--border-strong))] bg-[hsl(var(--background-elevated))] p-1 shadow-lg">
          {options.map((option) => (
            <button key={option.value} type="button" role="menuitem" onClick={() => { setOpen(false); onPick(option.value); }} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[hsl(var(--surface-muted))]">
              {option.label}
            </button>
          ))}
          <p className="px-3 pb-1 pt-2 text-xs text-[hsl(var(--foreground-muted))]">Arquivo CSV, abre no Excel.</p>
        </div>
      ) : null}
    </div>
  );
}
