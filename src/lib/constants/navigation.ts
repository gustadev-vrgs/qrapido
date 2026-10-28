import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import { Armchair, BarChart3, BookOpenText, ChefHat, HandPlatter, House, ReceiptText, Settings, Stethoscope, Users, Wallet } from "lucide-react";

import type { AppTone } from "@/components/ui/app-design-system";
import type { UserRole } from "@/lib/types/domain";

export type NavigationGroup = "operacao" | "gestao" | "sistema";

export interface NavigationItem {
  href: Route;
  label: string;
  icon: LucideIcon;
  description?: string;
  roles?: UserRole[];
  group: NavigationGroup;
  tone: AppTone;
  /** Shown in the phone's bottom bar (waiter use). */
  mobileTab?: boolean;
}

export const NAVIGATION_GROUPS: Array<{ id: NavigationGroup; label: string }> = [
  { id: "operacao", label: "Operação" },
  { id: "gestao", label: "Gestão" },
  { id: "sistema", label: "Sistema" }
];

export const dashboardNavItems: NavigationItem[] = [
  { href: "/dashboard", label: "Início", icon: House, description: "O dia do restaurante em um olhar", group: "operacao", tone: "primary" },
  { href: "/dashboard/salao", label: "Salão", icon: HandPlatter, description: "O que levar às mesas e quem está chamando", roles: ["admin", "manager", "attendant"], group: "operacao", tone: "success", mobileTab: true },
  { href: "/dashboard/cozinha", label: "Cozinha", icon: ChefHat, description: "Fila de pratos: toque em Pronto quando sair", group: "operacao", tone: "warning", mobileTab: true },
  { href: "/dashboard/mesas", label: "Mesas", icon: Armchair, description: "Abrir mesas, código para os clientes e conta", roles: ["admin", "manager", "attendant"], group: "operacao", tone: "primary", mobileTab: true },
  { href: "/dashboard/caixa", label: "Caixa", icon: Wallet, description: "Fechamento do dia: quanto entrou em cada forma", roles: ["admin", "manager", "attendant"], group: "operacao", tone: "success" },
  { href: "/dashboard/pedidos", label: "Pedidos", icon: ReceiptText, description: "Todos os pedidos do dia", group: "operacao", tone: "neutral" },
  { href: "/dashboard/cardapio", label: "Cardápio", icon: BookOpenText, description: "Categorias, pratos e bebidas", roles: ["admin", "manager"], group: "gestao", tone: "primary" },
  { href: "/dashboard/relatorios", label: "Relatórios", icon: BarChart3, description: "Vendas, produtos e mesas por período", roles: ["admin", "manager"], group: "gestao", tone: "primary" },
  { href: "/dashboard/equipe", label: "Equipe", icon: Users, description: "Quem acessa o painel e o que cada um vê", roles: ["admin", "manager"], group: "gestao", tone: "primary" },
  { href: "/dashboard/configuracoes", label: "Configurações", icon: Settings, description: "Restaurante, pagamentos e atendimento", roles: ["admin", "manager"], group: "sistema", tone: "neutral" },
  { href: "/dashboard/diagnostico", label: "Diagnóstico", icon: Stethoscope, description: "Verificar se está tudo configurado", roles: ["admin", "manager"], group: "sistema", tone: "neutral" }
];

export function findNavItem(pathname: string): NavigationItem | undefined {
  return [...dashboardNavItems].sort((a, b) => b.href.length - a.href.length).find((item) => pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`)));
}
