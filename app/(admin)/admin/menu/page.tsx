import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/services/format";
import { listMenu } from "@/lib/services/repositories";

export default async function MenuPage(): Promise<JSX.Element> {
  const { categories, items } = await listMenu();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Cardápio e Categorias</h1>
      {categories.map((category) => (
        <Card key={category.id}>
          <p className="font-medium">{category.name}</p>
          <p className="mb-3 text-sm text-graphite-300">{category.description}</p>
          <div className="space-y-2">
            {items.filter((item) => item.categoryId === category.id).map((item) => (
              <div key={item.id} className="rounded-lg border border-white/10 p-3 text-sm">
                <p>{item.name} · {formatCurrency(item.priceInCents)}</p>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
