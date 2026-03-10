import { BarChart3, ClipboardList, LayoutDashboard, Settings, UtensilsCrossed, WalletCards } from "lucide-react";
import type { NavigationItem } from "@/lib/types/navigation";

export const adminNavigation: NavigationItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Pedidos", href: "/dashboard/pedidos", icon: ClipboardList, badge: "Live" },
  { label: "Mesas", href: "/dashboard/mesas", icon: WalletCards },
  { label: "Cardápio", href: "/dashboard/cardapio", icon: UtensilsCrossed },
  { label: "Relatórios", href: "/dashboard/relatorios", icon: BarChart3 },
  { label: "Configurações", href: "/dashboard/configuracoes", icon: Settings }
];
