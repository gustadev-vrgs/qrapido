"use client";

import { useCallback, useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { CheckCircle2, CircleAlert, ExternalLink, Loader2, RefreshCw, Wrench, XCircle } from "lucide-react";

import { AppActionButton, AppSectionCard, AppSurface } from "@/components/ui/app-design-system";
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
    const db = getClientFirestore();
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

  return (
    <section className="space-y-4">
      <AppSurface className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
        <p>Logado como <strong>{user?.name}</strong> ({user?.role}) · restaurante <code>{user?.restaurantId}</code> · UID <code className="break-all">{firebaseUser?.uid}</code></p>
        <AppActionButton variant="secondary" className="gap-2" disabled={running} onClick={() => void run()}>{running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Verificar de novo</AppActionButton>
      </AppSurface>

      <AppSectionCard title="1. Servidor (Vercel)" description="Necessário para o QR Code, abrir/encerrar mesas e receber pedidos.">
        <ul className="space-y-2">{server.map((check) => <Row key={check.label} check={check} />)}</ul>
      </AppSectionCard>

      <AppSectionCard title="2. Regras do Firestore (painel)" description="O painel lê o banco direto do navegador; se as regras não estiverem publicadas, aparece erro de permissão.">
        <ul className="space-y-2">{rules.map((check) => <Row key={check.label} check={check} />)}</ul>
      </AppSectionCard>

      <AppSectionCard title="3. Dados do restaurante" description="Cadastros que faltam e mesas com QR Code inválido." action={fixable ? <AppActionButton className="gap-2" disabled={repairing} onClick={() => void repair()}>{repairing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}Corrigir automaticamente</AppActionButton> : null}>
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
      </AppSectionCard>
    </section>
  );
}
