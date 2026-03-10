interface MobileSessionPageProps {
  params: {
    sessionToken: string;
  };
}

export default function MobileSessionPage({ params }: MobileSessionPageProps): JSX.Element {
  return (
    <main className="min-h-screen bg-graphite-950 p-4 text-graphite-50">
      <section className="mx-auto flex max-w-md flex-col gap-4 rounded-2xl border border-white/10 bg-graphite-900/70 p-5 shadow-soft">
        <p className="text-xs uppercase tracking-[0.16em] text-emeraldAccent-300">Experiência do cliente</p>
        <h1 className="text-xl font-semibold">Sessão da mesa</h1>
        <p className="text-sm text-graphite-300">
          Shell mobile para pedidos sem login. A validação de sessão por token será implementada em etapa dedicada.
        </p>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-graphite-200">
          Token da sessão: <span className="font-mono">{params.sessionToken}</span>
        </div>
      </section>
    </main>
  );
}
