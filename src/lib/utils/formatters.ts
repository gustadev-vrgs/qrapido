const defaultLocale = "pt-BR";

export function formatCurrencyFromCents(valueInCents: number, currency = "BRL"): string {
  return new Intl.NumberFormat(defaultLocale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(valueInCents / 100);
}

export function formatCurrency(value: number, currency = "BRL"): string {
  return new Intl.NumberFormat(defaultLocale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(value);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat(defaultLocale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(date));
}

export function formatTime(date: string | Date): string {
  return new Intl.DateTimeFormat(defaultLocale, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat(defaultLocale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(date));
}
