"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellDot, Menu } from "lucide-react";
import { dashboardNavItems } from "@/lib/constants/navigation";
import { cn } from "@/lib/utils/cn";
import { AppActionButton, AppSearchInput, AppSurface } from "@/components/ui/app-design-system";

interface DashboardShellProps {
  children: ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps): JSX.Element {
  const pathname = usePathname();

  return (
    <div className="min-h-screen px-3 py-4 md:px-6 md:py-6">
      <div className="mx-auto grid w-full max-w-7xl gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="app-surface-strong h-fit p-4 md:p-5">
          <div className="mb-6 border-b border-[hsl(var(--border))] pb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--foreground-muted))]">QRápido</p>
            <p className="mt-1 text-xl font-semibold">Painel Operacional</p>
          </div>
          <nav className="space-y-1.5">
            {dashboardNavItems.map(({ href, icon: Icon, label }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-all",
                    active
                      ? "border border-[hsl(var(--focus-ring)/0.35)] bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--foreground))]"
                      : "border border-transparent text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--surface-muted))] hover:text-[hsl(var(--foreground))]"
                  )}
                >
                  <Icon size={16} />
                  {label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="space-y-4">
          <AppSurface variant="strong" className="flex flex-wrap items-center gap-2 p-3 md:p-4">
            <AppActionButton variant="ghost" className="px-3 lg:hidden" aria-label="Menu">
              <Menu className="h-4 w-4" />
            </AppActionButton>
            <AppSearchInput placeholder="Buscar pedidos, mesas ou clientes" className="min-w-[220px] flex-1" />
            <AppActionButton variant="secondary" className="gap-2">
              <BellDot className="h-4 w-4" />
              Alertas
            </AppActionButton>
          </AppSurface>
          {children}
        </main>
      </div>
    </div>
  );
}
