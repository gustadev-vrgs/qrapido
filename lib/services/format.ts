import type { OrderStatus, SessionStatus, TableStatus } from "@/lib/types/domain";

export function formatCurrency(valueInCents: number, currency = "BRL", locale = "pt-BR"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(valueInCents / 100);
}

export function formatDateTime(value: string | Date, locale = "pt-BR", timezone = "America/Sao_Paulo"): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: timezone
  }).format(date);
}

export function formatPercent(value: number, locale = "pt-BR"): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value) + "%";
}

export function tableStatusLabel(status: TableStatus): string {
  return {
    inactive: "Inativa",
    active: "Ativa",
    occupied: "Ocupada",
    closing: "Fechando"
  }[status];
}

export function sessionStatusLabel(status: SessionStatus): string {
  return {
    active: "Ativa",
    expired: "Expirada",
    closed: "Encerrada"
  }[status];
}

export function orderStatusLabel(status: OrderStatus): string {
  return {
    pending: "Pendente",
    accepted: "Aceito",
    preparing: "Preparando",
    ready: "Pronto",
    delivered: "Entregue",
    cancelled: "Cancelado"
  }[status];
}
