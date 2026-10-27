import type { OrderStation, OrderStatus } from "@/lib/types/domain";

/** What the diner reads for each order, depending on where it is prepared. */
export function customerStatusLabel(status: OrderStatus, station: OrderStation | undefined): string {
  if (status === "cancelled") return "Cancelado";
  if (status === "delivered") return "Entregue";
  if (status === "ready") return station === "ready" ? "A caminho" : "Pronto, já vai";
  return "Na cozinha";
}
