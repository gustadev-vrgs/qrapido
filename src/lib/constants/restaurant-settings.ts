import type { BusinessHours, PaymentMethod, WeekdayKey } from "@/lib/types/domain";

export const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  monday: "Segunda",
  tuesday: "Terça",
  wednesday: "Quarta",
  thursday: "Quinta",
  friday: "Sexta",
  saturday: "Sábado",
  sunday: "Domingo"
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  debit_card: "Cartão de débito",
  credit_card: "Cartão de crédito",
  card_on_counter: "Cartão no caixa",
  card_on_table: "Cartão na mesa"
};

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  monday: { isOpen: true, open: "09:00", close: "18:00" },
  tuesday: { isOpen: true, open: "09:00", close: "18:00" },
  wednesday: { isOpen: true, open: "09:00", close: "18:00" },
  thursday: { isOpen: true, open: "09:00", close: "18:00" },
  friday: { isOpen: true, open: "09:00", close: "18:00" },
  saturday: { isOpen: false, open: "09:00", close: "18:00" },
  sunday: { isOpen: false, open: "09:00", close: "18:00" }
};
