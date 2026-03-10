import { MobileCustomerLayout } from "@/components/layout/mobile-customer-layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface CustomerMenuPageProps {
  params: {
    sessionToken: string;
  };
}

export default function CustomerMenuPage({ params }: CustomerMenuPageProps): JSX.Element {
  return (
    <MobileCustomerLayout
      title="Cardápio da Mesa"
      subtitle={`Sessão ativa: ${params.sessionToken.slice(0, 8).toUpperCase()}...`}
    >
      <section className="space-y-4">
        <Card className="space-y-2 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-secondary">Destaque da Casa</p>
          <h2 className="text-xl font-semibold">Risoto de limão siciliano</h2>
          <p className="text-sm text-muted-foreground">Interface mobile pronta para receber categorias, filtros e carrinho.</p>
          <Button variant="secondary" className="w-full">
            Em breve: iniciar pedido
          </Button>
        </Card>
      </section>
    </MobileCustomerLayout>
  );
}
