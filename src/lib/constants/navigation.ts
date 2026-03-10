import type { Route } from "next";
import { BarChart3, LayoutGrid, Settings, ShoppingCart, UtensilsCrossed, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface DashboardNavItem {
  href: Route;
  label: string;
  icon: LucideIcon;
}

export const dashboardNavItems: DashboardNavItem[] = [
  { href: "/dashboard", label: "Visão geral", icon: LayoutGrid },
  { href: "/dashboard/pedidos", label: "Pedidos", icon: ShoppingCart },
  { href: "/dashboard/mesas", label: "Mesas", icon: UsersRound },
  { href: "/dashboard/cardapio", label: "Cardápio", icon: UtensilsCrossed },
  { href: "/dashboard/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/dashboard/configuracoes", label: "Configurações", icon: Settings }
];
