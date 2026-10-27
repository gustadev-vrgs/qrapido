import type { OrderStation } from "@/lib/types/domain";

/** Category names that usually hold items served without the kitchen. */
const READY_CATEGORY_WORDS = ["bebida", "drink", "refrigerante", "refri", "suco", "cerveja", "chopp", "vinho", "agua", "dose"];

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Setor de um produto: o valor escolhido no cardápio vence; sem escolha, produtos
 * de categorias de bebidas são "pronta entrega" e o resto vai para a cozinha.
 */
export function resolveStation(productStation: unknown, categoryName: string | null | undefined): OrderStation {
  if (productStation === "kitchen" || productStation === "ready") return productStation;
  const name = normalize(categoryName ?? "");
  return READY_CATEGORY_WORDS.some((word) => name.includes(word)) ? "ready" : "kitchen";
}

export const STATION_LABELS: Record<OrderStation, string> = {
  kitchen: "Cozinha",
  ready: "Pronta entrega"
};
