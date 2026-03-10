import { AppIcons } from "@/lib/icons";
import { orderStatusLabels, sessionStatusLabels, tableStatusLabels } from "@/lib/constants/status-labels";
import { orderStatusToneMap, sessionStatusToneMap, tableStatusToneMap, type BadgeTone } from "@/lib/constants/badge-variants";
import type { OrderStatus, SessionStatus, TableStatus } from "@/lib/types/domain";

export function getTableStatusMeta(status: TableStatus): { label: string; tone: BadgeTone } {
  return {
    label: tableStatusLabels[status],
    tone: tableStatusToneMap[status]
  };
}

export function getSessionStatusMeta(status: SessionStatus): { label: string; tone: BadgeTone } {
  return {
    label: sessionStatusLabels[status],
    tone: sessionStatusToneMap[status]
  };
}

export function getOrderStatusMeta(status: OrderStatus): { label: string; tone: BadgeTone } {
  return {
    label: orderStatusLabels[status],
    tone: orderStatusToneMap[status]
  };
}

export function getStatusIconByTone(tone: BadgeTone) {
  if (tone === "success") return AppIcons.statusSuccess;
  if (tone === "warning") return AppIcons.statusWarning;
  if (tone === "danger") return AppIcons.statusError;
  return AppIcons.statusInfo;
}
