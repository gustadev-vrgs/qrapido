import { Card } from "@/components/ui/card";

export default function SettingsPage(): JSX.Element {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Configurações do Restaurante</h1>
      <Card>
        <p className="text-sm text-graphite-300">Timezone: America/Sao_Paulo</p>
        <p className="text-sm text-graphite-300">Moeda: BRL</p>
        <p className="text-sm text-graphite-300">TTL de sessão: 120 min</p>
        <p className="text-sm text-graphite-300">Rate limit: 5 pedidos/min por sessão</p>
      </Card>
    </div>
  );
}
