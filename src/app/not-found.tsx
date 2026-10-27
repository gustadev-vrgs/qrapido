import Link from "next/link";
import { QrCode } from "lucide-react";

export default function NotFoundPage(): JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[hsl(var(--background))] p-4">
      <section className="app-surface-strong w-full max-w-md p-6 text-center md:p-8">
        <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[hsl(var(--primary-soft))] text-[hsl(var(--primary))]"><QrCode className="h-6 w-6" aria-hidden="true" /></span>
        <h1 className="mt-4 text-2xl">Página não encontrada</h1>
        <p className="mt-2 text-sm text-[hsl(var(--foreground-muted))]">Este endereço não existe. Se você escaneou o QR Code de uma mesa, peça ao atendente um novo código.</p>
        <Link href="/dashboard" className="mt-6 inline-flex h-11 items-center rounded-[var(--radius-md)] bg-[hsl(var(--primary))] px-5 text-sm font-semibold text-[hsl(var(--primary-foreground))]">
          Ir para o painel
        </Link>
      </section>
    </main>
  );
}
