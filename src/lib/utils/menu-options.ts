import type { MenuOptionGroup, OrderItemOption } from "@/lib/types/domain";
import { RESTAURANT_TIME_ZONE, toRestaurantDateKey } from "@/lib/utils/date-key";
import { formatCurrency } from "@/lib/utils/formatters";

export const WEEKDAYS = [
  { value: 0, short: "Dom", long: "domingo" },
  { value: 1, short: "Seg", long: "segunda" },
  { value: 2, short: "Ter", long: "terça" },
  { value: 3, short: "Qua", long: "quarta" },
  { value: 4, short: "Qui", long: "quinta" },
  { value: 5, short: "Sex", long: "sexta" },
  { value: 6, short: "Sáb", long: "sábado" }
] as const;

export const MAX_OPTION_GROUPS = 6;
export const MAX_OPTIONS_PER_GROUP = 15;

const round = (value: number) => Math.round(value * 100) / 100;
const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** Reads option groups from a Firestore document, dropping anything malformed. */
export function normalizeOptionGroups(raw: unknown): MenuOptionGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_OPTION_GROUPS).flatMap((group: unknown) => {
    if (!group || typeof group !== "object") return [];
    const value = group as Record<string, unknown>;
    const id = text(value.id, 40);
    const name = text(value.name, 60);
    const options = (Array.isArray(value.options) ? value.options : []).slice(0, MAX_OPTIONS_PER_GROUP).flatMap((option: unknown) => {
      if (!option || typeof option !== "object") return [];
      const item = option as Record<string, unknown>;
      const optionId = text(item.id, 40);
      const optionName = text(item.name, 60);
      const price = Number(item.price ?? 0);
      if (!optionId || !optionName || !Number.isFinite(price) || price < 0) return [];
      return [{ id: optionId, name: optionName, price: round(price) }];
    });
    if (!id || !name || options.length === 0) return [];
    const max = Math.min(options.length, Math.max(1, Math.floor(Number(value.max ?? 1)) || 1));
    const min = Math.min(max, Math.max(0, Math.floor(Number(value.min ?? 0)) || 0));
    return [{ id, name, min, max, options }];
  });
}

export function normalizeDays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const days = [...new Set(raw.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort();
  return days.length === 7 ? [] : days;
}

/** Restaurant-local weekday (0 = domingo). */
export function restaurantWeekday(date: Date = new Date(), timeZone = RESTAURANT_TIME_ZONE): number {
  const [year, month, day] = toRestaurantDateKey(date, timeZone).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

export function isServedOn(days: number[] | undefined, weekday: number): boolean {
  return !days || days.length === 0 || days.includes(weekday);
}

export function describeDays(days: number[] | undefined): string {
  if (!days || days.length === 0) return "Todos os dias";
  if (days.length === 5 && [1, 2, 3, 4, 5].every((day) => days.includes(day))) return "Segunda a sexta";
  return days.map((day) => WEEKDAYS[day].short).join(", ");
}

export type ChoiceError = "unknown_option" | "too_many" | "missing_required";

/**
 * Turns the customer's choices into priced options, enforcing min/max per group.
 * Used by the server (authoritative) and by the phone (to show the price).
 */
export function resolveChoices(groups: MenuOptionGroup[], choices: Array<{ groupId: string; optionId: string }> | undefined): { options: OrderItemOption[]; extra: number } | { error: ChoiceError; group?: string } {
  const chosen = choices ?? [];
  const known = new Set(groups.map((group) => group.id));
  if (chosen.some((choice) => !known.has(choice.groupId))) return { error: "unknown_option" };
  const options: OrderItemOption[] = [];
  for (const group of groups) {
    const ids = [...new Set(chosen.filter((choice) => choice.groupId === group.id).map((choice) => choice.optionId))];
    if (ids.length > group.max) return { error: "too_many", group: group.name };
    if (ids.length < group.min) return { error: "missing_required", group: group.name };
    for (const id of ids) {
      const option = group.options.find((item) => item.id === id);
      if (!option) return { error: "unknown_option", group: group.name };
      options.push({ groupName: group.name, name: option.name, price: option.price });
    }
  }
  return { options, extra: round(options.reduce((sum, option) => sum + option.price, 0)) };
}

export function formatOptions(options: OrderItemOption[] | undefined): string {
  return (options ?? []).map((option) => (option.price > 0 ? `${option.name} (+${formatCurrency(option.price)})` : option.name)).join(" · ");
}

export function groupRuleLabel(group: MenuOptionGroup): string {
  if (group.min === 1 && group.max === 1) return "Escolha 1";
  if (group.min === 0 && group.max === 1) return "Opcional, até 1";
  if (group.min === 0) return `Opcional, até ${group.max}`;
  if (group.min === group.max) return `Escolha ${group.min}`;
  return `Escolha de ${group.min} a ${group.max}`;
}

export function newOptionId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** "2x PF de frango (Arroz e feijão, Ovo frito)" for one-line summaries. */
export function describeOrderItem(item: { quantity: number; nameSnapshot: string; options?: OrderItemOption[] }): string {
  const names = (item.options ?? []).map((option) => option.name).join(", ");
  return `${item.quantity}x ${item.nameSnapshot}${names ? ` (${names})` : ""}`;
}
