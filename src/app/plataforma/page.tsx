"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { onAuthStateChanged, sendEmailVerification, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { Building2, Copy, Loader2, LogOut, Plus, QrCode, RefreshCw } from "lucide-react";

import { AppActionButton, AppFormField, AppSurface, AppTextInput } from "@/components/ui/app-design-system";
import { getFirebaseClientAuth } from "@/lib/firebase/client";
import { appToast } from "@/lib/utils/toast";

type Restaurant = { id: string; name: string; isActive: boolean; createdAt: string | null; team: number };
type Created = { restaurantName: string; adminEmail: string; adminPassword: string | null };

const slugify = (value: string): string => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

function makePassword(): string {
  const letters = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const pick = (source: string) => source[crypto.getRandomValues(new Uint32Array(1))[0] % source.length];
  return `${Array.from({ length: 5 }, () => pick(letters)).join("")}${Array.from({ length: 5 }, () => pick(digits)).join("")}`;
}

/** Platform owner's area: sign up new restaurants with their first administrator. */
export default function PlataformaPage(): JSX.Element {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [restaurants, setRestaurants] = useState<Restaurant[] | null>(null);
  const [problem, setProblem] = useState<{ message: string; code?: string } | null>(null);
  const [login, setLogin] = useState({ email: "", password: "" });
  const [form, setForm] = useState({ restaurantName: "", restaurantId: "", adminName: "", adminEmail: "", adminPassword: makePassword() });
  const [idTouched, setIdTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);

  useEffect(() => onAuthStateChanged(getFirebaseClientAuth(), setUser), []);

  const call = useCallback(async <T,>(method: "GET" | "POST", body?: unknown): Promise<T> => {
    const current = getFirebaseClientAuth().currentUser;
    if (!current) throw Object.assign(new Error("Faça login."), { code: "invalid_token" });
    const response = await fetch("/api/platform/restaurants", { method, cache: "no-store", headers: { authorization: `Bearer ${await current.getIdToken(true)}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(payload.error ?? "Falha na requisição."), { code: payload.code });
    return payload as T;
  }, []);

  const load = useCallback(async () => {
    try {
      setRestaurants((await call<{ restaurants: Restaurant[] }>("GET")).restaurants);
      setProblem(null);
    } catch (failure) {
      setRestaurants(null);
      setProblem({ message: failure instanceof Error ? failure.message : "Erro.", code: (failure as { code?: string }).code });
    }
  }, [call]);

  useEffect(() => { if (user) void load(); }, [user, load]);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await signInWithEmailAndPassword(getFirebaseClientAuth(), login.email.trim().toLowerCase(), login.password);
    } catch {
      appToast.error("Não foi possível entrar", "Confira e-mail e senha.");
    } finally {
      setBusy(false);
    }
  };

  const verifyEmail = async () => {
    const current = getFirebaseClientAuth().currentUser;
    if (!current) return;
    try {
      await sendEmailVerification(current);
      appToast.success("E-mail enviado", "Abra o link que chegou na sua caixa de entrada e depois toque em Atualizar.");
    } catch {
      appToast.error("Não foi possível enviar", "Tente de novo em alguns minutos.");
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await call<{ passwordKept: boolean }>("POST", form);
      setCreated({ restaurantName: form.restaurantName, adminEmail: form.adminEmail.trim().toLowerCase(), adminPassword: result.passwordKept ? null : form.adminPassword });
      setForm({ restaurantName: "", restaurantId: "", adminName: "", adminEmail: "", adminPassword: makePassword() });
      setIdTouched(false);
      await load();
    } catch (failure) {
      appToast.error("Não foi possível cadastrar", failure instanceof Error ? failure.message : "Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  const loginUrl = typeof window === "undefined" ? "/login" : `${window.location.origin}/login`;
  const copyAccess = () => {
    if (!created) return;
    const text = `Acesso ao QRápido · ${created.restaurantName}\nLink: ${loginUrl}\nE-mail: ${created.adminEmail}\n${created.adminPassword ? `Senha: ${created.adminPassword}` : "Senha: a mesma que você já usa (ou \"Esqueci minha senha\" no login)"}`;
    void navigator.clipboard?.writeText(text).then(() => appToast.success("Dados copiados")).catch(() => appToast.info("Dados de acesso", text));
  };

  return (
    <main className="min-h-screen bg-[hsl(var(--background))] px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" aria-hidden="true"><QrCode className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1"><h1 className="text-2xl">Plataforma</h1><p className="text-sm text-[hsl(var(--foreground-muted))]">Restaurantes que usam o QRápido.</p></div>
          {user ? <AppActionButton variant="ghost" className="gap-2" onClick={() => void signOut(getFirebaseClientAuth())}><LogOut className="h-4 w-4" />Sair</AppActionButton> : null}
        </header>

        {user === undefined ? <AppSurface className="p-6 text-sm text-[hsl(var(--foreground-muted))]">Carregando...</AppSurface> : null}

        {user === null ? (
          <form onSubmit={(event) => void signIn(event)} className="app-surface-strong mx-auto max-w-sm space-y-4 p-6">
            <p className="text-sm text-[hsl(var(--foreground-muted))]">Área restrita ao responsável pela plataforma.</p>
            <AppFormField label="E-mail"><AppTextInput type="email" autoComplete="email" value={login.email} onChange={(event) => setLogin({ ...login, email: event.target.value })} /></AppFormField>
            <AppFormField label="Senha"><AppTextInput type="password" autoComplete="current-password" value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} /></AppFormField>
            <AppActionButton type="submit" className="h-11 w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Entrar</AppActionButton>
          </form>
        ) : null}

        {user && problem ? (
          <AppSurface className="space-y-3 p-5 text-sm">
            <p className="font-semibold">{problem.message}</p>
            {problem.code === "email_not_verified" ? <AppActionButton variant="secondary" onClick={() => void verifyEmail()}>Enviar e-mail de confirmação</AppActionButton> : null}
            <AppActionButton variant="ghost" className="gap-2" onClick={() => void getFirebaseClientAuth().currentUser?.reload().then(load)}><RefreshCw className="h-4 w-4" />Atualizar</AppActionButton>
          </AppSurface>
        ) : null}

        {user && restaurants ? (
          <>
            <form onSubmit={(event) => void submit(event)} className="app-surface-strong space-y-4 p-5">
              <h2 className="flex items-center gap-2 text-lg"><Plus className="h-5 w-5" />Novo restaurante</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <AppFormField label="Nome do restaurante"><AppTextInput value={form.restaurantName} maxLength={80} onChange={(event) => setForm({ ...form, restaurantName: event.target.value, restaurantId: idTouched ? form.restaurantId : slugify(event.target.value) })} /></AppFormField>
                <AppFormField label="Identificador" hint="Não muda depois. Letras minúsculas, números e hífen."><AppTextInput className="num" value={form.restaurantId} maxLength={40} onChange={(event) => { setIdTouched(true); setForm({ ...form, restaurantId: event.target.value.toLowerCase() }); }} /></AppFormField>
                <AppFormField label="Nome do responsável"><AppTextInput value={form.adminName} maxLength={80} onChange={(event) => setForm({ ...form, adminName: event.target.value })} /></AppFormField>
                <AppFormField label="E-mail do responsável"><AppTextInput type="email" value={form.adminEmail} maxLength={120} onChange={(event) => setForm({ ...form, adminEmail: event.target.value })} /></AppFormField>
                <AppFormField label="Senha inicial" hint="Mínimo 8 caracteres. Você passa para o responsável."><AppTextInput className="num" value={form.adminPassword} maxLength={64} onChange={(event) => setForm({ ...form, adminPassword: event.target.value })} /></AppFormField>
              </div>
              <AppActionButton type="submit" disabled={busy || form.restaurantName.trim().length < 2 || form.restaurantId.length < 3 || form.adminName.trim().length < 2 || !form.adminEmail.includes("@") || form.adminPassword.length < 8}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Cadastrar restaurante</AppActionButton>
            </form>

            {created ? (
              <AppSurface className="space-y-2 border-[hsl(var(--success)/0.5)] p-5 text-sm">
                <p className="font-semibold">{created.restaurantName} cadastrado. Passe estes dados ao responsável:</p>
                <p>Link: <strong className="break-all">{loginUrl}</strong></p>
                <p>E-mail: <strong>{created.adminEmail}</strong></p>
                <p>{created.adminPassword ? <>Senha: <strong className="num">{created.adminPassword}</strong></> : "Este e-mail já tinha uma conta: a senha dele não foi trocada."}</p>
                <AppActionButton variant="secondary" className="gap-2" onClick={copyAccess}><Copy className="h-4 w-4" />Copiar</AppActionButton>
              </AppSurface>
            ) : null}

            <AppSurface className="p-5">
              <h2 className="mb-3 flex items-center gap-2 text-lg"><Building2 className="h-5 w-5" />Restaurantes ({restaurants.length})</h2>
              {restaurants.length ? (
                <ul className="divide-y divide-[hsl(var(--border))] text-sm">
                  {restaurants.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                      <span><strong>{item.name}</strong> <span className="num text-[hsl(var(--foreground-muted))]">{item.id}</span></span>
                      <span className="shrink-0 text-[hsl(var(--foreground-muted))]">{item.team} {item.team === 1 ? "pessoa" : "pessoas"} na equipe</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-[hsl(var(--foreground-muted))]">Nenhum restaurante ainda.</p>}
            </AppSurface>
          </>
        ) : null}
      </div>
    </main>
  );
}
