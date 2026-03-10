import type { ReactNode } from "react";
import type { Route } from "next";
"use client";

import Link from "next/link";
import { BarChart3, LayoutGrid, QrCode, Settings, ShoppingCart, UtensilsCrossed, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const nav: Array<{ href: Route; label: string; icon: LucideIcon }> = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/admin/tables", label: "Mesas", icon: UsersRound },
  { href: "/admin/sessions", label: "Sessões", icon: UsersRound },
  { href: "/admin/orders", label: "Pedidos", icon: ShoppingCart },
  { href: "/admin/menu", label: "Cardápio", icon: UtensilsCrossed },
  { href: "/admin/reports", label: "Relatórios", icon: BarChart3 },
  { href: "/admin/qr", label: "QR Codes", icon: QrCode },
  { href: "/admin/settings", label: "Configurações", icon: Settings }
];

export function AdminShell({ children }: { children: ReactNode }): JSX.Element {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-graphite-950 p-4 md:p-6">
      <div className="mx-auto grid w-full max-w-7xl gap-4 md:grid-cols-[240px_1fr]">
        <aside className="surface p-4">
          <p className="mb-6 text-xl font-semibold">QRápido</p>
          <nav className="space-y-1">
            {nav.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-graphite-200",
                    pathname === item.href && "bg-emeraldAccent-500/20 text-emeraldAccent-300"
                  )}
                >
                  <Icon size={16} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}
