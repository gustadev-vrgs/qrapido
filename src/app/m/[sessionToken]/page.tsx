import { QrCode } from "lucide-react";

export const metadata = {
  title: "QR Code desatualizado · QRápido"
};

// Links antigos continham um segredo de sessão e não podem ser convertidos em
// autorização. Mostramos um aviso ao cliente sem reutilizar nem registrar esse valor.
export default function LegacyTableLink(): JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[hsl(var(--background))] p-4">
      <section className="app-surface-strong w-full max-w-md p-6 text-center md:p-8">
        <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[hsl(var(--primary-soft))] text-[hsl(var(--primary))]">
          <QrCode className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-2xl">Este QR Code está desatualizado</h1>
        <p className="mt-2 text-sm text-[hsl(var(--foreground-muted))]">
          Leia o QR Code colado na sua mesa. Se ele não abrir o cardápio, peça a um atendente o código atualizado.
        </p>
      </section>
    </main>
  );
}
