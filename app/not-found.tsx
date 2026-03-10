export default function NotFound(): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-graphite-950 text-center">
      <div>
        <h1 className="text-3xl font-semibold">Sessão inválida</h1>
        <p className="mt-2 text-sm text-graphite-300">Esta mesa não está ativa ou a sessão expirou.</p>
      </div>
    </div>
  );
}
