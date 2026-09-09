import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import { AppIcons } from "@/lib/icons";
import type { UserRole } from "@/lib/types/domain";

export interface NavigationItem {
  href: Route;
  label: string;
  icon: LucideIcon;
  description?: string;
  roles?: UserRole[];
}

export const dashboardNavItems: NavigationItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: AppIcons.dashboard, description: "Resumo operacional" },
  { href: "/dashboard/pedidos", label: "Pedidos", icon: AppIcons.orders, description: "Fila de pedidos" },
  { href: "/dashboard/mesas", label: "Mesas", icon: AppIcons.tables, description: "Ocupação de mesas" },
  { href: "/dashboard/cardapio", label: "Cardápio", icon: AppIcons.menu, description: "Itens e categorias", roles: ["admin", "manager"] },
  { href: "/dashboard/relatorios", label: "Relatórios", icon: AppIcons.reports, description: "Métricas e desempenho", roles: ["admin", "manager"] },
  { href: "/dashboard/configuracoes", label: "Configurações", icon: AppIcons.settings, description: "Preferências do sistema", roles: ["admin", "manager"] }
];

export const authNavItems: NavigationItem[] = [{ href: "/login", label: "Entrar", icon: AppIcons.settings }];
