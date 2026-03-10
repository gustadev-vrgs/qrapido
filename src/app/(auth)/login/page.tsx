import { LockKeyhole, Sparkles } from "lucide-react";

import { AdminLoginForm } from "@/components/auth/admin-login-form";

export default function LoginPage(): JSX.Element {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,#14d59c1a,transparent_35%),radial-gradient(circle_at_bottom,#21a8ff12,transparent_40%)]" />

      <section className="app-surface-strong relative w-full max-w-5xl overflow-hidden p-0 md:grid md:grid-cols-[1.05fr_0.95fr]">
        <div className="border-b border-[hsl(var(--border))] p-8 md:border-b-0 md:border-r md:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[hsl(var(--foreground-muted))]">QRápido | Staff Access</p>
          <h1 className="mt-4 text-3xl">Autenticação administrativa</h1>
          <p className="mt-3 max-w-md text-sm text-[hsl(var(--foreground-muted))]">
            Login restrito para a equipe operacional. Acesso ao dashboard liberado apenas para usuários de staff ativos.
          </p>

          <div className="mt-8 space-y-3">
            <div className="rounded-xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted)/0.55)] p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <LockKeyhole className="h-4 w-4 text-[hsl(var(--primary))]" />
                Sessão segura
              </div>
              <p className="mt-1 text-xs text-[hsl(var(--foreground-muted))]">Persistência local do Firebase Auth com validação do perfil de staff.</p>
            </div>
            <div className="rounded-xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted)/0.55)] p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-[hsl(var(--info))]" />
                Experiência de operação
              </div>
              <p className="mt-1 text-xs text-[hsl(var(--foreground-muted))]">Feedback imediato de erros, loading elegante e fluxo alinhado ao App Router.</p>
            </div>
          </div>
        </div>

        <div className="p-8 md:p-10">
          <h2 className="text-xl">Entrar no painel</h2>
          <p className="mt-2 text-sm text-[hsl(var(--foreground-muted))]">Use suas credenciais corporativas para continuar.</p>
          <div className="mt-6">
            <AdminLoginForm />
          </div>
        </div>
      </section>
    </main>
  );
}
