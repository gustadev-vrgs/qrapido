import Link from "next/link";

export default function NotFoundPage(): JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center bg-graphite-950 p-4">
      <section className="surface w-full max-w-lg p-6 text-center md:p-8">
        <p className="text-xs uppercase tracking-[0.16em] text-emeraldAccent-300">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Página não encontrada</h1>
        <p className="mt-2 text-sm text-graphite-300">O caminho informado não existe na fundação atual do QRápido.</p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex rounded-lg bg-emeraldAccent-500 px-4 py-2 text-sm font-medium text-graphite-950"
        >
          Voltar ao dashboard
        </Link>
      </section>
    </main>
  );
}
