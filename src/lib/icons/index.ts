import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  LayoutGrid,
  Settings,
  ShoppingCart,
  UtensilsCrossed,
  UsersRound,
  XCircle
} from "lucide-react";

export const AppIcons = {
  dashboard: LayoutGrid,
  orders: ShoppingCart,
  tables: UsersRound,
  menu: UtensilsCrossed,
  reports: BarChart3,
  settings: Settings,
  statusSuccess: CheckCircle2,
  statusWarning: AlertTriangle,
  statusInfo: Clock3,
  statusError: XCircle
} as const;
