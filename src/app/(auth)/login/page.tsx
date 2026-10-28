import { QrCode } from "lucide-react";

import { AdminLoginForm } from "@/components/auth/admin-login-form";

export const metadata = {
  title: "Entrar · QRápido"
};

export default function LoginPage(): JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[hsl(var(--background))] p-4">
      <section className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" aria-hidden="true">
            <QrCode className="h-5 w-5" />
          </span>
          <p className="text-xl font-bold">QRápido</p>
        </div>

        <div className="app-surface-strong p-6 md:p-8">
          <h1 className="text-2xl">Entrar</h1>
          <p className="mt-1 text-sm text-[hsl(var(--foreground-muted))]">Acesso da equipe do restaurante.</p>
          <div className="mt-6">
            <AdminLoginForm />
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-[hsl(var(--foreground-muted))]">
          Acesso restrito a estabelecimentos cadastrados. Sem acesso? Fale com o responsável pelo seu restaurante.
        </p>
      </section>
    </main>
  );
}
