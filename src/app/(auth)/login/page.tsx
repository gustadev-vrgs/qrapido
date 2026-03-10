import Link from "next/link";

export default function LoginPage(): JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-graphite-950 via-[#171c22] to-graphite-950 p-4">
      <section className="surface w-full max-w-md p-6 md:p-8">
        <p className="text-xs uppercase tracking-[0.18em] text-emeraldAccent-300">QRápido</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Acesso da equipe</h1>
        <p className="mt-2 text-sm text-graphite-300">
          Base inicial pronta para autenticação de funcionários. A lógica segura será conectada nas próximas etapas.
        </p>

        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-graphite-200">
          Placeholder profissional de login com foco em operação de restaurante presencial.
        </div>

        <Link
          href="/dashboard"
          className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-emeraldAccent-500 px-4 py-2 text-sm font-medium text-graphite-950 transition hover:bg-emeraldAccent-400"
        >
          Entrar no painel (modo shell)
        </Link>
      </section>
    </main>
  );
}
