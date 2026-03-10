import type { OrderStatus, SessionStatus, TableStatus } from "@/lib/types/domain";

export type BadgeTone = "default" | "info" | "success" | "warning" | "danger" | "neutral";

export const badgeToneClassMap: Record<BadgeTone, string> = {
  default: "border-white/20 bg-white/10 text-white",
  info: "border-sky-400/30 bg-sky-500/15 text-sky-200",
  success: "border-emerald-400/30 bg-emerald-500/15 text-emerald-200",
  warning: "border-amber-400/30 bg-amber-500/15 text-amber-100",
  danger: "border-rose-400/30 bg-rose-500/15 text-rose-200",
  neutral: "border-graphite-600 bg-graphite-800/70 text-graphite-200"
};

export const tableStatusToneMap: Record<TableStatus, BadgeTone> = {
  free: "success",
  active: "info",
  awaiting_payment: "warning",
  closed: "neutral",
  blocked: "danger"
};

export const sessionStatusToneMap: Record<SessionStatus, BadgeTone> = {
  active: "info",
  expired: "warning",
  closed: "neutral",
  blocked: "danger"
};

export const orderStatusToneMap: Record<OrderStatus, BadgeTone> = {
  received: "info",
  in_preparation: "warning",
  ready: "success",
  delivered: "neutral",
  cancelled: "danger"
};
