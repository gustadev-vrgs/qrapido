import "server-only";

/** Starter menu of a common Brazilian "restaurante de prato feito". Prices are suggestions; everything is editable. */
type Group = { id: string; name: string; min: number; max: number; options: Array<{ id: string; name: string; price: number }> };
export interface SampleItem { name: string; category: "Pratos feitos" | "Bebidas"; description: string; price: number; image: string; preparationTimeMinutes: number; optionGroups?: Group[]; availableDays?: number[]; isFeatured?: boolean }

const acompanhamento: Group = { id: "acompanhamento", name: "Acompanhamento", min: 1, max: 1, options: [
  { id: "arroz-feijao", name: "Arroz e feijão", price: 0 },
  { id: "arroz-tropeiro", name: "Arroz e feijão tropeiro", price: 3 },
  { id: "arroz-salada", name: "Arroz e salada", price: 0 }
] };
const adicionais: Group = { id: "adicionais", name: "Adicionais", min: 0, max: 3, options: [
  { id: "ovo", name: "Ovo frito", price: 3 },
  { id: "batata", name: "Batata frita extra", price: 6 },
  { id: "bacon", name: "Bacon", price: 4 }
] };

export const SAMPLE_CATEGORIES = [{ name: "Pratos feitos", description: "Servidos com arroz, feijão e salada", sortOrder: 0 }, { name: "Bebidas", description: "Geladas", sortOrder: 1 }] as const;

export const SAMPLE_ITEMS: SampleItem[] = [
  { name: "PF de frango grelhado", category: "Pratos feitos", description: "Filé de frango grelhado, arroz, feijão, salada e batata frita.", price: 24.9, image: "pf-frango.jpg", preparationTimeMinutes: 15, optionGroups: [acompanhamento, adicionais], isFeatured: true },
  { name: "Bife acebolado", category: "Pratos feitos", description: "Bife bovino com cebola dourada, arroz, feijão e batata frita.", price: 28.9, image: "bife-acebolado.jpg", preparationTimeMinutes: 18, optionGroups: [{ id: "ponto", name: "Ponto da carne", min: 1, max: 1, options: [{ id: "mal", name: "Mal passada", price: 0 }, { id: "ponto", name: "Ao ponto", price: 0 }, { id: "bem", name: "Bem passada", price: 0 }] }, acompanhamento, adicionais] },
  { name: "Feijoada completa", category: "Pratos feitos", description: "Feijoada com carnes, arroz, farofa, couve e laranja. Quarta e sábado.", price: 34.9, image: "feijoada.jpg", preparationTimeMinutes: 10, availableDays: [3, 6], isFeatured: true },
  { name: "Frango à parmegiana", category: "Pratos feitos", description: "Filé de frango empanado com molho de tomate e queijo, arroz e batata frita.", price: 32.9, image: "parmegiana.jpg", preparationTimeMinutes: 20, optionGroups: [adicionais] },
  { name: "Strogonoff de frango", category: "Pratos feitos", description: "Strogonoff cremoso com champignon, arroz branco e batata palha.", price: 27.9, image: "strogonoff.jpg", preparationTimeMinutes: 15, optionGroups: [adicionais] },
  { name: "Refrigerante lata 350 ml", category: "Bebidas", description: "Bem gelado.", price: 6, image: "refrigerante.jpg", preparationTimeMinutes: 0, optionGroups: [{ id: "sabor", name: "Sabor", min: 1, max: 1, options: [{ id: "cola", name: "Cola", price: 0 }, { id: "cola-zero", name: "Cola zero", price: 0 }, { id: "guarana", name: "Guaraná", price: 0 }, { id: "laranja", name: "Laranja", price: 0 }] }] },
  { name: "Suco natural 400 ml", category: "Bebidas", description: "Feito na hora.", price: 9, image: "suco.jpg", preparationTimeMinutes: 0, optionGroups: [{ id: "fruta", name: "Fruta", min: 1, max: 1, options: [{ id: "laranja", name: "Laranja", price: 0 }, { id: "limao", name: "Limão", price: 0 }, { id: "maracuja", name: "Maracujá", price: 0 }, { id: "abacaxi-hortela", name: "Abacaxi com hortelã", price: 1 }] }, { id: "acucar", name: "Açúcar", min: 1, max: 1, options: [{ id: "com", name: "Com açúcar", price: 0 }, { id: "sem", name: "Sem açúcar", price: 0 }] }] },
  { name: "Água mineral 500 ml", category: "Bebidas", description: "", price: 4, image: "agua.jpg", preparationTimeMinutes: 0, optionGroups: [{ id: "tipo", name: "Tipo", min: 1, max: 1, options: [{ id: "sem-gas", name: "Sem gás", price: 0 }, { id: "com-gas", name: "Com gás", price: 0 }] }] }
];

export const SAMPLE_IMAGE_PREFIX = "/cardapio-exemplo/";

export function slugify(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 80) || "item";
}
