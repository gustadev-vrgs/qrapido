/** Restaurant-local calendar day (YYYY-MM-DD). Orders made at 22h belong to that day, not to the next UTC day. */
export const RESTAURANT_TIME_ZONE = process.env.NEXT_PUBLIC_RESTAURANT_TIME_ZONE?.trim() || "America/Sao_Paulo";

export function toRestaurantDateKey(date: Date = new Date(), timeZone = RESTAURANT_TIME_ZONE): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function previousDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day - 1, 12));
  return date.toISOString().slice(0, 10);
}
