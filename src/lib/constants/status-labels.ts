import type { OrderStatus, SessionStatus, TableStatus } from "@/lib/types/domain";

export const tableStatusLabels: Record<TableStatus, string> = {
  free: "Livre",
  active: "Ativa",
  awaiting_payment: "Aguardando pagamento",
  closed: "Fechada",
  blocked: "Bloqueada"
};

export const sessionStatusLabels: Record<SessionStatus, string> = {
  active: "Ativa",
  expired: "Expirada",
  closed: "Fechada",
  blocked: "Bloqueada"
};

export const orderStatusLabels: Record<OrderStatus, string> = {
  received: "Recebido",
  in_preparation: "Em preparo",
  ready: "Pronto",
  delivered: "Entregue",
  cancelled: "Cancelado"
};
