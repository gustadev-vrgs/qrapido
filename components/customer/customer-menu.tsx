"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/services/format";
import { buildDedupeKey, enforceRateLimit } from "@/lib/services/security";
import { menuItems } from "@/lib/mocks/data";

export function CustomerMenu({ sessionId }: { sessionId: string }): JSX.Element {
  const [selected, setSelected] = useState<string[]>([]);
  const total = useMemo(
    () => selected.reduce((acc, id) => acc + (menuItems.find((item) => item.id === id)?.priceInCents ?? 0), 0),
    [selected]
  );

  const submitOrder = (): void => {
    const allow = enforceRateLimit(sessionId, 5);
    if (!allow) {
      toast.error("Limite de pedidos por minuto atingido.");
      return;
    }
    const dedupe = buildDedupeKey(sessionId, selected);
    toast.success(`Pedido enviado (${dedupe.slice(0, 12)}...)`);
    setSelected([]);
  };

  return (
    <div className="space-y-3">
      {menuItems.map((item) => (
        <Card key={item.id} className="flex items-center justify-between">
          <div>
            <p className="font-medium">{item.name}</p>
            <p className="text-xs text-graphite-300">{item.description}</p>
          </div>
          <button
            className="rounded-lg border border-white/15 px-3 py-1 text-xs"
            onClick={() => setSelected((prev) => (prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]))}
            type="button"
          >
            {formatCurrency(item.priceInCents)}
          </button>
        </Card>
      ))}
      <Card>
        <p className="mb-2 text-sm">Total: {formatCurrency(total)}</p>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={submitOrder} disabled={selected.length === 0}>Fazer pedido</Button>
          <Button className="flex-1" variant="ghost" onClick={() => toast.info("Garçom chamado com sucesso")}>Chamar garçom</Button>
          <Button className="flex-1" variant="ghost" onClick={() => toast.info("Conta solicitada")}>Pedir conta</Button>
        </div>
      </Card>
    </div>
  );
}
