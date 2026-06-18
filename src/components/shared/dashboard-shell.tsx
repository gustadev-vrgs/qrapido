"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, Moon, Sun, X } from "lucide-react";

import { ROLE_LABELS } from "@/lib/auth/roles";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import { dashboardNavItems } from "@/lib/constants/navigation";
import { cn } from "@/lib/utils/cn";
import { AppActionButton } from "@/components/ui/app-design-system";
import { useTheme } from "@/components/providers/theme-provider";

interface DashboardShellProps {
  children: ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, user } = useAdminAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const isDarkMode = resolvedTheme === "dark";

  const toggleTheme = () => {
    setTheme(isDarkMode ? "light" : "dark");
  };

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
            <AppActionButton variant="secondary" className="w-full justify-start gap-2" onClick={toggleTheme}>
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {isDarkMode ? "Modo claro" : "Modo escuro"}
            </AppActionButton>
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
          <label htmlFor="admin-sidebar-toggle" className="inline-flex lg:hidden">
            <span className="sr-only">Abrir navegação</span>
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))] text-[hsl(var(--foreground-muted))]">
              <Menu className="h-4 w-4" />
            </span>
          </label>

          <section className="space-y-4 rounded-3xl border border-[hsl(var(--border))] bg-[linear-gradient(180deg,hsl(var(--background-elevated)/0.84),hsl(var(--surface)/0.95))] p-3 shadow-[inset_0_1px_0_hsl(var(--background-elevated))] md:p-5">
            {children}
          </section>
        </main>
      </div>
    </div>
  );
}
