import type {
  ActorType,
  OrderEventType,
  OrderStatus,
  PaymentMethod,
  SessionStatus,
  TableStatus,
  UserRole
} from "@/lib/types/domain";

export const tableStatusLabels: Record<TableStatus, string> = {
  free: "Livre",
  active: "Ativa",
  awaiting_payment: "Aguardando pagamento",
  closed: "Fechada",
  blocked: "Bloqueada"
};

export const sessionStatusLabels: Record<SessionStatus, string> = {
  active: "Ativa",
  idle: "Inativa",
  expired: "Expirada",
  closed: "Fechada",
  blocked: "Bloqueada"
};

export const orderStatusLabels: Record<OrderStatus, string> = {
  received: "Recebido",
  confirmed: "Confirmado",
  in_preparation: "Em preparo",
  ready: "Pronto",
  delivered: "Entregue",
  cancelled: "Cancelado"
};

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  pix: "PIX",
  cash: "Dinheiro",
  debit_card: "Cartão de débito",
  credit_card: "Cartão de crédito",
  card_on_counter: "Cartão no caixa",
  card_on_table: "Cartão na mesa"
};

export const userRoleLabels: Record<UserRole, string> = {
  admin: "Administrador",
  manager: "Gerente",
  attendant: "Atendente",
  kitchen: "Cozinha"
};

export const orderEventTypeLabels: Record<OrderEventType, string> = {
  session_created: "Sessão iniciada",
  session_closed: "Sessão encerrada",
  order_created: "Pedido criado",
  order_confirmed: "Pedido confirmado",
  order_updated: "Pedido atualizado",
  order_ready: "Pedido pronto",
  order_delivered: "Pedido entregue",
  order_cancelled: "Pedido cancelado",
  waiter_called: "Garçom chamado",
  bill_requested: "Conta solicitada",
  table_opened: "Mesa aberta",
  table_closed: "Mesa fechada"
};

export const actorTypeLabels: Record<ActorType, string> = {
  staff: "Equipe",
  customer: "Cliente",
  system: "Sistema"
};
