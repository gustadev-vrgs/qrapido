"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Search } from "lucide-react";
import type { ReactNode } from "react";
import { adminNavigation } from "@/lib/constants/navigation";
import { brand } from "@/lib/constants/theme";
import { cn } from "@/lib/utils/cn";
import { Input } from "@/components/ui/input";

interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps): JSX.Element {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-aurora">
      <aside className="hidden w-72 border-r border-white/10 bg-black/20 p-6 lg:block">
        <div className="mb-10 space-y-1">
          <p className="text-xl font-semibold tracking-tight">{brand.name}</p>
          <p className="text-sm text-muted-foreground">Painel Administrativo</p>
        </div>

        <nav className="space-y-1">
          {adminNavigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center justify-between rounded-xl px-4 py-3 text-sm text-muted-foreground transition hover:bg-white/10 hover:text-foreground",
                  isActive && "bg-primary/20 text-foreground"
                )}
              >
                <span className="flex items-center gap-3">
                  <item.icon className="size-4" />
                  {item.label}
                </span>
                {item.badge ? (
                  <span className="rounded-full bg-secondary/20 px-2 py-0.5 text-xs text-secondary">{item.badge}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1 p-4 md:p-8">
        <header className="surface mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar pedidos, mesas e itens..." className="pl-9" />
          </div>
          <button className="rounded-xl border border-white/15 p-2 hover:bg-white/10" type="button" aria-label="Notificações">
            <Bell className="size-5" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
