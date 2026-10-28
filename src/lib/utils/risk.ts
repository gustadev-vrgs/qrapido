import type { Order, TableSession } from "@/lib/types/domain";

export const RISK_LABELS: Record<NonNullable<Order["riskFlags"]>[number], string> = {
  big_quantity: "quantidade muito grande",
  high_value: "valor alto para a mesa",
  rapid_orders: "muitos pedidos seguidos"
};

/** Wrong codes typed for the current code before the team is warned (someone may be guessing). */
export const CODE_GUESS_ALERT = 10;

export function needsReview(order: Order): boolean {
  return Boolean(order.riskFlags?.length) && !order.riskReviewedAt && order.status !== "cancelled" && order.status !== "delivered";
}

export function riskText(order: Order): string {
  return (order.riskFlags ?? []).map((flag) => RISK_LABELS[flag]).join(", ");
}

export function isGuessingCode(session: TableSession | undefined): boolean {
  return (session?.accessFailedAttempts ?? 0) >= CODE_GUESS_ALERT;
}
