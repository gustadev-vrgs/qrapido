"use client";

import { useCallback, useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { CheckCircle2, ChevronDown, CircleAlert, Database, ExternalLink, Eraser, Loader2, RefreshCw, Server, ShieldCheck, Stethoscope, Wrench, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { AppActionButton, AppSurface } from "@/components/ui/app-design-system";
import { cn } from "@/lib/utils/cn";
import { describeFirebaseError } from "@/lib/data/errors";
import { getClientFirestore } from "@/lib/firebase/firestore";
import { useAdminApi } from "@/lib/hooks/use-admin-api";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import { toRestaurantDateKey } from "@/lib/utils/date-key";
import { appToast } from "@/lib/utils/toast";

type Check = { label: string; ok: boolean | null; detail: string; link?: string };
type Health = { firebaseAdmin: { ok: boolean; source: string; projectId: string | null; problems: string[] }; firestore: { ok: boolean; code?: string; hint?: string; detail?: string }; firebaseClient: { projectId: string | null }; publicUrl: { base: string; problem: string | null } };
type Issue = { code: string; severity: "error" | "warning"; message: string; fix: string; link?: string };

function Row({ check }: { check: Check }): JSX.Element {
  const Icon = check.ok === null ? Loader2 : check.ok ? CheckCircle2 : XCircle;
  const color = check.ok === null ? "" : check.ok ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]";
  return (
    <li className="flex items-start gap-3 rounded-xl border border-[hsl(var(--border))] p-3">
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${color} ${check.ok === null ? "animate-spin" : ""}`} />
      <div className="min-w-0 text-sm">
        <p className="font-semibold">{check.label}</p>
        <p className="break-words text-[hsl(var(--foreground-muted))]">{check.detail}</p>
        {check.link ? <a className="inline-flex items-center gap-1 text-[hsl(var(--info))] underline" href={check.link} target="_blank" rel="noreferrer">Abrir no Firebase<ExternalLink className="h-3 w-3" /></a> : null}
      </div>
    </li>
  );
}

type Status = "loading" | "ok" | "problem";

/** A check group that starts closed: the header says if everything is fine; details open on demand. */
function Section({ icon: Icon, title, description, status, summary, action, children }: { icon: LucideIcon; title: string; description: string; status: Status; summary: string; action?: React.ReactNode; children: React.ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false);
  const StatusIcon = status === "loading" ? Loader2 : status === "ok" ? CheckCircle2 : XCircle;
  return (
    <AppSurface className={cn("overflow-hidden p-0", status === "problem" ? "border-[hsl(var(--danger)/0.45)]" : "")}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-[hsl(var(--surface-muted))]">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--surface-muted))]"><Icon className="h-5 w-5 text-[hsl(var(--foreground-muted))]" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          <span className="block text-sm text-[hsl(var(--foreground-muted))]">{description}</span>
        </span>
        <span className={cn("hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold sm:inline-flex", status === "ok" ? "bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]" : status === "problem" ? "bg-[hsl(var(--danger)/0.1)] text-[hsl(var(--danger))]" : "bg-[hsl(var(--surface-muted))] text-[hsl(var(--foreground-muted))]")}><StatusIcon className={cn("h-3.5 w-3.5", status === "loading" ? "animate-spin" : "")} />{summary}</span>
        <StatusIcon className={cn("h-5 w-5 shrink-0 sm:hidden", status === "ok" ? "text-[hsl(var(--success))]" : status === "problem" ? "text-[hsl(var(--danger))]" : "animate-spin")} aria-label={summary} />
        <ChevronDown className={cn("h-5 w-5 shrink-0 text-[hsl(var(--foreground-muted))] transition-transform", open ? "rotate-180" : "")} aria-hidden="true" />
      </button>
      {open ? <div className="space-y-3 border-t border-[hsl(var(--border))] p-4">{action ? <div className="flex justify-end">{action}</div> : null}{children}</div> : null}
    </AppSurface>
  );
}

function statusOf(checks: Check[]): { status: Status; summary: string } {
  if (!checks.length || checks.some((check) => check.ok === null)) return { status: "loading", summary: "Verificando" };
  const bad = checks.filter((check) => !check.ok).length;
  return bad ? { status: "problem", summary: `${bad} com problema` } : { status: "ok", summary: "Tudo certo" };
}

export default function DiagnosticoPage(): JSX.Element {
  const { user, firebaseUser } = useAdminAuth();
  const api = useAdminApi();
  const [server, setServer] = useState<Check[]>([]);
  const [rules, setRules] = useState<Check[]>([]);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [issuesError, setIssuesError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [repairing, setRepairing] = useState(false);

  const run = useCallback(async () => {
    if (!user?.restaurantId) return;
    setRunning(true);

    // 1. Server configuration (works even when the Admin credentials are broken).
    try {
      const health = await (await fetch("/api/health", { cache: "no-store" })).json() as Health;
      const mismatch = health.firebaseAdmin.projectId && health.firebaseClient.projectId && health.firebaseAdmin.projectId !== health.firebaseClient.projectId;
      setServer([
        { label: "Credenciais do Firebase Admin no servidor", ok: health.firebaseAdmin.ok, detail: health.firebaseAdmin.ok ? `Configuradas (projeto ${health.firebaseAdmin.projectId}).` : health.firebaseAdmin.problems.join(" ") || "Ausentes." },
        { label: "Servidor acessa o Firestore", ok: health.firestore.ok, detail: health.firestore.ok ? "Conectado." : [health.firestore.hint ?? "Sem acesso.", health.firestore.detail].filter(Boolean).join(" Detalhe: ") },
        { label: "Site e servidor usam o mesmo projeto Firebase", ok: !mismatch, detail: mismatch ? `Site: ${health.firebaseClient.projectId} · Servidor: ${health.firebaseAdmin.projectId}. Use as credenciais do mesmo projeto.` : `Projeto ${health.firebaseClient.projectId ?? "?"}.` },
        { label: "Endereço usado nos QR Codes", ok: !health.publicUrl.problem, detail: health.publicUrl.problem ?? `${health.publicUrl.base} (abre no celular).` }
      ]);
    } catch {
      setServer([{ label: "Servidor", ok: false, detail: "Não foi possível consultar /api/health." }]);
    }

    // 2. Firestore rules as seen by this browser (the panel reads Firestore directly).
    let db: ReturnType<typeof getClientFirestore>;
    try {
      db = getClientFirestore();
    } catch (error) {
      // Missing NEXT_PUBLIC_FIREBASE_* variables: report it instead of spinning forever.
      setRules([{ label: "Configuração do Firebase no site", ok: false, detail: error instanceof Error ? error.message : "Variáveis NEXT_PUBLIC_FIREBASE_* ausentes." }]);
      setIssues(null);
      setIssuesError("Sem a configuração do Firebase no site, os dados não podem ser verificados.");
      setRunning(false);
      return;
    }
    const restaurantId = user.restaurantId;
    const probes: Array<[string, () => Promise<unknown>]> = [
      ["Seu cadastro em staffUsers", () => getDoc(doc(db, "staffUsers", firebaseUser?.uid ?? "-"))],
      ["Mesas", () => getDocs(query(collection(db, "tables"), where("restaurantId", "==", restaurantId), limit(1)))],
      ["Atendimentos", () => getDocs(query(collection(db, "tableSessions"), where("restaurantId", "==", restaurantId), where("status", "==", "active"), limit(1)))],
      ["Pedidos", () => getDocs(query(collection(db, "orders"), where("restaurantId", "==", restaurantId), where("dateKey", "==", toRestaurantDateKey()), limit(1)))],
      ["Cardápio", () => getDocs(query(collection(db, "menuItems"), where("restaurantId", "==", restaurantId), limit(1)))],
      ["Configurações", () => getDocs(query(collection(db, "restaurantSettings"), where("restaurantId", "==", restaurantId), limit(1)))],
      ["Cadastro do restaurante", () => getDoc(doc(db, "restaurants", restaurantId))]
    ];
    setRules(probes.map(([label]) => ({ label, ok: null, detail: "Verificando..." })));
    const results = await Promise.all(probes.map(async ([label, probe]) => {
      try { await probe(); return { label, ok: true, detail: "Leitura permitida." }; } catch (error) { return { label, ok: false, detail: describeFirebaseError(error) }; }
    }));
    setRules(results);

    // 3. Restaurant data checks done by the server.
    try {
      const report = await api<{ issues: Issue[] }>("/api/admin/operations/diagnose");
      setIssues(report.issues);
      setIssuesError(null);
    } catch (failure) {
      setIssues(null);
      setIssuesError(failure instanceof Error ? failure.message : "Falha ao verificar os dados.");
    }
    setRunning(false);
  }, [api, firebaseUser?.uid, user?.restaurantId]);

  useEffect(() => { void run(); }, [run]);

  const [cleaning, setCleaning] = useState(false);
  const cleanup = async () => {
    setCleaning(true);
    try {
      const result = await api<{ total: number; more: boolean }>("/api/admin/operations/cleanup", {});
      appToast.success(result.total ? `${result.total} registro(s) vencido(s) apagado(s)` : "Nada para limpar", result.more ? "Ainda há mais: toque de novo para continuar." : undefined);
    } catch (failure) {
      appToast.error("Não foi possível limpar", failure instanceof Error ? failure.message : "Tente novamente.");
    } finally {
      setCleaning(false);
    }
  };

  const repair = async () => {
    setRepairing(true);
    try {
      const result = await api<{ done: string[] }>("/api/admin/operations/repair", {});
      appToast.success("Correções aplicadas", result.done.join(" "));
      await run();
    } catch (failure) {
      appToast.error("Não foi possível corrigir", failure instanceof Error ? failure.message : "Tente novamente.");
    } finally {
      setRepairing(false);
    }
  };

  const fixable = (issues ?? []).some((issue) => ["RESTAURANT_DOC_MISSING", "SETTINGS_MISSING", "TABLE_QR_INVALID"].includes(issue.code));
  const serverStatus = statusOf(server);
  const rulesStatus = statusOf(rules);
  const dataStatus: { status: Status; summary: string } = issuesError ? { status: "problem", summary: "Falhou" } : issues === null ? { status: "loading", summary: "Verificando" } : issues.some((issue) => issue.severity === "error") ? { status: "problem", summary: `${issues.length} pendência(s)` } : issues.length ? { status: "ok", summary: `${issues.length} aviso(s)` } : { status: "ok", summary: "Tudo certo" };
  const overall = [serverStatus, rulesStatus, dataStatus];
  const problems = overall.filter((item) => item.status === "problem").length;
  const checking = overall.some((item) => item.status === "loading");

  return (
    <section className="space-y-4">
      <AppSurface className={cn("flex flex-wrap items-center gap-4 p-5", checking ? "" : problems ? "border-[hsl(var(--danger)/0.45)] bg-[hsl(var(--danger)/0.04)]" : "border-[hsl(var(--success)/0.4)] bg-[hsl(var(--success)/0.05)]")}>
        <span className={cn("inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", checking ? "bg-[hsl(var(--surface-muted))]" : problems ? "bg-[hsl(var(--danger))] text-white" : "bg-[hsl(var(--success))] text-white")}>{checking ? <Loader2 className="h-6 w-6 animate-spin" /> : problems ? <XCircle className="h-6 w-6" /> : <Stethoscope className="h-6 w-6" />}</span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold">{checking ? "Verificando o sistema..." : problems ? `${problems} ${problems === 1 ? "parte precisa" : "partes precisam"} de atenção` : "Tudo funcionando"}</p>
          <p className="text-sm text-[hsl(var(--foreground-muted))]">{checking ? "Leva alguns segundos." : problems ? "Toque na parte em vermelho para ver o que fazer." : "Toque em uma parte para ver os detalhes."}</p>
        </div>
        <AppActionButton variant="secondary" className="gap-2" disabled={running} onClick={() => void run()}>{running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Verificar de novo</AppActionButton>
        <details className="w-full text-xs text-[hsl(var(--foreground-muted))]">
          <summary className="cursor-pointer">Dados para o suporte</summary>
          <p className="mt-1 break-all">Logado como <strong>{user?.name}</strong> ({user?.role}) · restaurante <code>{user?.restaurantId}</code> · UID <code>{firebaseUser?.uid}</code></p>
        </details>
      </AppSurface>

      <Section icon={Server} title="Servidor (Vercel)" description="QR Code, abrir e fechar mesas, receber pedidos." {...serverStatus}>
        <ul className="space-y-2">{server.map((check) => <Row key={check.label} check={check} />)}</ul>
      </Section>

      <Section icon={ShieldCheck} title="Regras do Firestore" description="O que este navegador consegue ler no banco." {...rulesStatus}>
        <ul className="space-y-2">{rules.map((check) => <Row key={check.label} check={check} />)}</ul>
      </Section>

      <Section icon={Database} title="Dados do restaurante" description="Cadastros que faltam e mesas com QR Code inválido." {...dataStatus} action={fixable ? <AppActionButton className="gap-2" disabled={repairing} onClick={() => void repair()}>{repairing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}Corrigir automaticamente</AppActionButton> : null}>
        {issuesError ? <p className="text-sm text-[hsl(var(--danger))]">{issuesError}</p> : null}
        {issues === null && !issuesError ? <p className="text-sm text-[hsl(var(--foreground-muted))]">Verificando...</p> : null}
        {issues?.length === 0 ? <p className="flex items-center gap-2 text-sm text-[hsl(var(--success))]"><CheckCircle2 className="h-4 w-4" />Tudo certo com os dados.</p> : null}
        <ul className="space-y-2">
          {issues?.map((issue, index) => (
            <li key={`${issue.code}-${index}`} className="flex items-start gap-3 rounded-xl border border-[hsl(var(--border))] p-3 text-sm">
              <CircleAlert className={`mt-0.5 h-5 w-5 shrink-0 ${issue.severity === "error" ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--warning))]"}`} />
              <div><p>{issue.message}</p><p className="text-[hsl(var(--foreground-muted))]">{issue.fix}</p>{issue.link ? <a className="inline-flex items-center gap-1 text-[hsl(var(--info))] underline" href={issue.link} target="_blank" rel="noreferrer">Criar índice no Firebase<ExternalLink className="h-3 w-3" /></a> : null}</div>
            </li>
          ))}
        </ul>
      </Section>

      <Section icon={Eraser} title="Limpeza de dados vencidos" description="Registros temporários de segurança que já venceram. Use uma vez por mês." status="ok" summary="Manual">
        <p className="text-sm text-[hsl(var(--foreground-muted))]">Apaga limites de tentativas, acessos antigos de celulares e registros contra pedido duplicado que já venceram. No plano gratuito o Firebase não apaga sozinho. Não mexe em pedidos, mesas, cardápio nem relatórios.</p>
        <AppActionButton variant="secondary" className="gap-2" disabled={cleaning} onClick={() => void cleanup()}>{cleaning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eraser className="h-4 w-4" />}Limpar dados vencidos</AppActionButton>
      </Section>
    </section>
  );
}
