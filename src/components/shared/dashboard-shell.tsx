"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { dashboardNavItems } from "@/lib/constants/navigation";
import { cn } from "@/lib/utils/cn";

interface DashboardShellProps {
  children: ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps): JSX.Element {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gradient-to-br from-graphite-950 via-[#161a1f] to-graphite-950 p-4 md:p-6">
      <div className="mx-auto grid w-full max-w-7xl gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="surface h-fit p-4">
          <div className="mb-6 border-b border-white/10 pb-4">
            <p className="text-xs uppercase tracking-[0.16em] text-emeraldAccent-300">QRápido</p>
            <p className="mt-1 text-lg font-semibold">Painel Operacional</p>
          </div>
          <nav className="space-y-1">
            {dashboardNavItems.map(({ href, icon: Icon, label }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                    active ? "bg-emeraldAccent-500/20 text-emeraldAccent-200" : "text-graphite-200 hover:bg-white/5"
                  )}
                >
                  <Icon size={16} />
                  {label}
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
