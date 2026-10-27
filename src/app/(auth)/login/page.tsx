import { ChefHat, HandPlatter, QrCode, ScanLine } from "lucide-react";

import { AdminLoginForm } from "@/components/auth/admin-login-form";

const STEPS = [
  { icon: ScanLine, title: "O cliente escaneia", text: "O QR Code colado na mesa abre o cardápio no celular dele." },
  { icon: ChefHat, title: "A cozinha recebe", text: "O pedido aparece na hora no painel, com aviso sonoro." },
  { icon: HandPlatter, title: "O salão leva", text: "Bebidas vão direto para entrega; pratos quando ficam prontos." }
];

export default function LoginPage(): JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[hsl(var(--background))] p-4">
      <section className="app-surface-strong w-full max-w-4xl overflow-hidden p-0 md:grid md:grid-cols-[1fr_1fr]">
        <div className="bg-[hsl(var(--primary))] p-7 text-[hsl(var(--primary-foreground))] md:p-10">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[hsl(var(--primary-foreground)/0.15)]" aria-hidden="true"><QrCode className="h-6 w-6" /></span>
            <p className="text-xl font-bold">QRápido</p>
          </div>
          <h1 className="mt-8 text-3xl">Pedido da mesa direto para a cozinha.</h1>
          <ol className="mt-8 hidden space-y-5 md:block">
            {STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <li key={step.title} className="flex gap-3">
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--gema))] text-[hsl(217_28%_15%)]" aria-hidden="true"><Icon className="h-5 w-5" /></span>
                  <div><p className="font-semibold">{step.title}</p><p className="text-sm opacity-85">{step.text}</p></div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="p-7 md:p-10">
          <h2 className="text-2xl">Entrar no painel</h2>
          <p className="mt-2 text-sm text-[hsl(var(--foreground-muted))]">Acesso da equipe do restaurante: caixa, cozinha e garçons.</p>
          <div className="mt-6">
            <AdminLoginForm />
          </div>
        </div>
      </section>
    </main>
  );
}
