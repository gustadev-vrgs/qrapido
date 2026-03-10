import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage(): JSX.Element {
  return (
    <div>
      <PageHeader title="Visão geral" description="Acompanhe os indicadores mais importantes do seu restaurante." />
      <section className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index} className="space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-4 w-20" />
          </Card>
        ))}
      </section>
    </div>
  );
}
