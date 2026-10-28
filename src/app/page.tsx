import Link from "next/link";
import { BellRing, ChefHat, CupSoda, HandPlatter, QrCode, ReceiptText, ScanLine, Smartphone, Wallet } from "lucide-react";

export const metadata = {
  title: "QRápido · pedido pelo QR Code da mesa",
  description: "Sistema gratuito para restaurantes: o cliente pede pelo celular, a cozinha recebe na hora e o garçom só leva."
};

const STEPS = [
  { icon: ScanLine, title: "O cliente escaneia", text: "O QR Code impresso na mesa abre o cardápio no celular dele, sem instalar nada." },
  { icon: ChefHat, title: "A cozinha recebe", text: "O prato aparece na tela da cozinha com aviso sonoro. Um toque em \"Pronto\"." },
  { icon: HandPlatter, title: "O garçom leva", text: "Bebidas vão direto para entrega; pratos, quando a cozinha libera." },
  { icon: Wallet, title: "O caixa fecha", text: "A conta da mesa já está somada. Escolha PIX, dinheiro ou cartão e a mesa fica livre." }
];

const FEATURES = [
  { icon: Smartphone, text: "Funciona no celular do cliente, no do garçom e no computador do caixa" },
  { icon: CupSoda, text: "Bebida não passa pela cozinha: vai direto para quem leva" },
  { icon: BellRing, text: "Chamar garçom e pedir a conta pelo celular" },
  { icon: ReceiptText, text: "Prato feito com acompanhamento, adicionais e prato do dia" }
];

export default function HomePage(): JSX.Element {
  return (
    <main className="min-h-screen bg-[hsl(var(--background))]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <span className="flex items-center gap-2 text-lg font-bold"><span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><QrCode className="h-5 w-5" aria-hidden="true" /></span>QRápido</span>
        <Link href="/login" className="rounded-[var(--radius-md)] px-4 py-2 text-sm font-semibold text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary-soft))]">Entrar</Link>
      </header>

      <section className="mx-auto grid max-w-5xl gap-10 px-4 pb-14 pt-6 md:grid-cols-[1.1fr_0.9fr] md:items-center md:pt-12">
        <div>
          <h1 className="text-4xl md:text-5xl">Da mesa para a cozinha sem papel e sem fila.</h1>
          <p className="mt-4 max-w-xl text-lg text-[hsl(var(--foreground-muted))]">O cliente pede pelo QR Code da mesa, a cozinha recebe na hora e o garçom só leva. Feito para restaurante de prato feito, gratuito.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/login" className="inline-flex h-12 items-center rounded-[var(--radius-md)] bg-[hsl(var(--primary))] px-6 text-base font-semibold text-[hsl(var(--primary-foreground))]">Entrar no painel</Link>
            <a href="#como-funciona" className="inline-flex h-12 items-center rounded-[var(--radius-md)] border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] px-6 text-base font-semibold">Como funciona</a>
          </div>
        </div>

        {/* A comanda: the same ticket the kitchen sees. */}
        <div className="comanda mx-auto w-full max-w-sm space-y-3 p-5 pl-6 shadow-[0_18px_40px_-24px_hsl(217_28%_15%/0.5)]" data-tone="kitchen" aria-hidden="true">
          <div className="flex items-start justify-between">
            <p className="text-3xl font-bold leading-none">Mesa 4</p>
            <span className="num rounded-full bg-[hsl(var(--surface-muted))] px-3 py-1 text-sm font-bold">3 min</span>
          </div>
          <ul className="space-y-2 text-lg">
            <li><span className="num font-bold">2x</span> PF de frango grelhado<span className="block text-base font-semibold text-[hsl(var(--primary))]">Feijão tropeiro · Ovo frito</span></li>
            <li><span className="num font-bold">1x</span> Feijoada completa</li>
          </ul>
          <p className="rounded-lg bg-[hsl(var(--gema)/0.18)] px-3 py-2 text-base">↳ sem cebola no frango</p>
          <p className="flex h-12 items-center justify-center rounded-[var(--radius-md)] bg-[hsl(var(--success))] text-lg font-semibold text-white">Pronto</p>
        </div>
      </section>

      <section id="como-funciona" className="border-y border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
        <div className="mx-auto max-w-5xl px-4 py-12">
          <h2 className="text-2xl">Como funciona</h2>
          <ol className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.title} className="space-y-2">
                  <span className="flex items-center gap-2"><span className="num inline-flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--gema))] text-sm font-bold text-[hsl(217_28%_15%)]">{index + 1}</span><Icon className="h-5 w-5 text-[hsl(var(--primary))]" aria-hidden="true" /></span>
                  <h3>{step.title}</h3>
                  <p className="text-sm text-[hsl(var(--foreground-muted))]">{step.text}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12">
        <ul className="grid gap-3 sm:grid-cols-2">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return <li key={feature.text} className="flex items-start gap-3"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--success))]" aria-hidden="true" /><span>{feature.text}</span></li>;
          })}
        </ul>
      </section>

      <footer className="border-t border-[hsl(var(--border))]">
        <p className="mx-auto max-w-5xl px-4 py-6 text-sm text-[hsl(var(--foreground-muted))]">QRápido · projeto de extensão (Proex) de Engenharia de Software, gratuito para a comunidade.</p>
      </footer>
    </main>
  );
}
