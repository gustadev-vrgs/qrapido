import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import { AppIcons } from "@/lib/icons";

export interface NavigationItem {
  href: Route;
  label: string;
  icon: LucideIcon;
  description?: string;
}

export const dashboardNavItems: NavigationItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: AppIcons.dashboard, description: "Resumo operacional" },
  { href: "/dashboard/pedidos", label: "Pedidos", icon: AppIcons.orders, description: "Fila de pedidos" },
  { href: "/dashboard/mesas", label: "Mesas", icon: AppIcons.tables, description: "Ocupação de mesas" },
  { href: "/dashboard/cardapio", label: "Cardápio", icon: AppIcons.menu, description: "Itens e categorias" },
  { href: "/dashboard/relatorios", label: "Relatórios", icon: AppIcons.reports, description: "Métricas e desempenho" },
  { href: "/dashboard/configuracoes", label: "Configurações", icon: AppIcons.settings, description: "Preferências do sistema" }
];

export const authNavItems: NavigationItem[] = [{ href: "/login", label: "Entrar", icon: AppIcons.settings }];
