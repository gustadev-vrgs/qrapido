"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BellDot, ChevronRight, LogOut, Menu, X } from "lucide-react";

import { ROLE_LABELS } from "@/lib/auth/roles";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import { dashboardNavItems } from "@/lib/constants/navigation";
import { cn } from "@/lib/utils/cn";
import { AppActionButton, AppSearchInput, AppSurface } from "@/components/ui/app-design-system";

interface DashboardShellProps {
  children: ReactNode;
}

interface RouteContext {
  title: string;
  description: string;
  section: string;
}

const routeContext: Record<string, RouteContext> = {
  "/dashboard": {
    title: "Dashboard",
    description: "Acompanhe indicadores, alertas e a saúde operacional em tempo real.",
    section: "Painel"
  },
  "/dashboard/pedidos": {
    title: "Pedidos",
    description: "Central para monitorar fila, preparo e ritmo de expedição dos pedidos.",
    section: "Operação"
  },
  "/dashboard/mesas": {
    title: "Mesas",
    description: "Contexto completo de ocupação, giro e sessões ativas do salão.",
    section: "Operação"
  },
  "/dashboard/cardapio": {
    title: "Cardápio",
    description: "Gerencie categorias, itens e disponibilidade com consistência visual.",
    section: "Gestão"
  },
  "/dashboard/relatorios": {
    title: "Relatórios",
    description: "Leia desempenho diário com visão financeira e operacional consolidada.",
    section: "Inteligência"
  },
  "/dashboard/configuracoes": {
    title: "Configurações",
    description: "Ajuste parâmetros do restaurante, operação e preferências da equipe.",
    section: "Administração"
  }
};

function getRouteContext(pathname: string): RouteContext {
  const directMatch = routeContext[pathname];
  if (directMatch) {
    return directMatch;
  }

  const fallbackEntry = Object.keys(routeContext)
    .sort((a, b) => b.length - a.length)
    .find((route) => pathname.startsWith(route));

  return fallbackEntry ? routeContext[fallbackEntry] : routeContext["/dashboard"];
}

export function DashboardShell({ children }: DashboardShellProps): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, user } = useAdminAuth();
  const currentRoute = getRouteContext(pathname);

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const isNavItemActive = (href: string): boolean => {
    if (href === "/dashboard") {
      return pathname === href;
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] p-3 md:p-5">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 lg:grid lg:grid-cols-[290px_1fr]">
        <input id="admin-sidebar-toggle" type="checkbox" className="peer sr-only" />

        <label
          htmlFor="admin-sidebar-toggle"
          className="fixed inset-0 z-30 hidden cursor-pointer bg-black/40 opacity-0 transition-opacity duration-300 peer-checked:block peer-checked:opacity-100 lg:hidden"
          aria-label="Fechar menu"
        />

        <aside className="app-surface-strong fixed inset-y-3 left-3 z-40 flex w-[85vw] max-w-[320px] -translate-x-[120%] flex-col bg-[linear-gradient(180deg,hsl(var(--background-elevated)),hsl(var(--surface)))] p-5 transition-transform duration-300 peer-checked:translate-x-0 lg:sticky lg:top-5 lg:z-10 lg:h-[calc(100vh-2.5rem)] lg:w-auto lg:max-w-none lg:translate-x-0">
          <div className="mb-6 flex items-start justify-between border-b border-[hsl(var(--border))] pb-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[hsl(var(--foreground-muted))]">QRápido</p>
              <p className="mt-2 text-2xl font-semibold">Casa Aurora</p>
              <p className="mt-2 text-xs text-[hsl(var(--foreground-muted))]">Operação inteligente em tempo real</p>
            </div>
            <label htmlFor="admin-sidebar-toggle" className="lg:hidden">
              <span className="sr-only">Fechar navegação</span>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))] text-[hsl(var(--foreground-muted))]">
                <X className="h-4 w-4" />
              </span>
            </label>
          </div>

          <nav className="space-y-2">
            {dashboardNavItems.map(({ href, icon: Icon, label, description }) => {
              const active = isNavItemActive(href);

              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "group relative flex items-start gap-3 rounded-2xl border px-3 py-3 transition-all duration-200",
                    active
                      ? "border-[hsl(var(--primary)/0.35)] bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--foreground))] shadow-[0_6px_18px_hsl(var(--primary)/0.12)]"
                      : "border-transparent text-[hsl(var(--foreground-muted))] hover:border-[hsl(var(--border-strong))] hover:bg-[hsl(var(--surface-muted)/0.7)] hover:text-[hsl(var(--foreground))]"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-colors",
                      active
                        ? "border-[hsl(var(--primary)/0.32)] bg-[hsl(var(--primary)/0.18)] text-[hsl(var(--primary))]"
                        : "border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] group-hover:border-[hsl(var(--primary)/0.32)]"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium">{label}</span>
                    {description ? <span className="truncate text-xs text-[hsl(var(--foreground-muted))]">{description}</span> : null}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto space-y-3 border-t border-[hsl(var(--border))] pt-4">
            <div className="rounded-2xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))] p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-[hsl(var(--foreground-muted))]">Usuário logado</p>
              <p className="mt-1 text-sm font-semibold">{user?.name ?? "Equipe QRápido"}</p>
              <p className="text-xs text-[hsl(var(--foreground-muted))]">{user ? ROLE_LABELS[user.role] : "Administrador"}</p>
            </div>
            <AppActionButton variant="secondary" className="w-full justify-start gap-2" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              Logout
            </AppActionButton>
          </div>
        </aside>

        <main className="space-y-4">
          <AppSurface variant="strong" className="sticky top-3 z-20 flex flex-col gap-4 p-4 md:top-5 md:p-5">
            <div className="flex items-center gap-2 md:gap-3">
              <label htmlFor="admin-sidebar-toggle" className="lg:hidden">
                <span className="sr-only">Abrir navegação</span>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))] text-[hsl(var(--foreground-muted))]">
                  <Menu className="h-4 w-4" />
                </span>
              </label>
              <AppSearchInput placeholder="Buscar pedido, mesa ou cliente" className="flex-1" />
              <AppActionButton variant="secondary" className="hidden gap-2 sm:inline-flex">
                <BellDot className="h-4 w-4" />
                Alertas
              </AppActionButton>
            </div>

            <div className="space-y-2">
              <p className="flex items-center gap-1 text-xs uppercase tracking-[0.16em] text-[hsl(var(--foreground-muted))]">
                Dashboard
                <ChevronRight className="h-3.5 w-3.5" />
                {currentRoute.section}
              </p>
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold md:text-3xl">{currentRoute.title}</h1>
                <p className="max-w-3xl text-sm text-[hsl(var(--foreground-muted))] md:text-base">{currentRoute.description}</p>
              </div>
            </div>
          </AppSurface>

          <section className="space-y-4 rounded-3xl border border-[hsl(var(--border))] bg-[linear-gradient(180deg,hsl(var(--background-elevated)/0.84),hsl(var(--surface)/0.95))] p-3 shadow-[inset_0_1px_0_hsl(var(--background-elevated))] md:p-5">
            {children}
          </section>
        </main>
      </div>
    </div>
  );
}
