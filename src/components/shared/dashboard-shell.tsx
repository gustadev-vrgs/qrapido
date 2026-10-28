"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, Moon, MoreHorizontal, QrCode, Sun, X } from "lucide-react";

import { AppIconBadge } from "@/components/ui/app-design-system";
import { useTheme } from "@/components/providers/theme-provider";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { DEFAULT_RESTAURANT_NAME, RESTAURANT_NAME_UPDATED_EVENT, resolveRestaurantDisplayName } from "@/lib/constants/restaurant";
import { dashboardNavItems, findNavItem, NAVIGATION_GROUPS, type NavigationItem } from "@/lib/constants/navigation";
import { RestaurantsService } from "@/lib/data/services/restaurants-service";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import { cn } from "@/lib/utils/cn";

function Brand({ restaurantName }: { restaurantName: string }): JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" aria-hidden="true"><QrCode className="h-5 w-5" /></span>
      <div className="min-w-0">
        <p className="truncate text-base font-bold leading-tight">{restaurantName}</p>
        <p className="text-xs text-[hsl(var(--foreground-muted))]">QRápido</p>
      </div>
    </div>
  );
}

function NavLink({ item, active, onNavigate }: { item: NavigationItem; active: boolean; onNavigate?: () => void }): JSX.Element {
  const Icon = item.icon;
  return (
    <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
      className={cn("flex items-center gap-3 rounded-[var(--radius-md)] px-2.5 py-2 text-[15px] font-medium transition-colors",
        active ? "bg-[hsl(var(--primary-soft))] text-[hsl(var(--primary))]" : "text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-muted))]")}>
      <Icon className={cn("h-5 w-5 shrink-0", active ? "" : "text-[hsl(var(--foreground-muted))]")} aria-hidden="true" />
      {item.label}
    </Link>
  );
}

export function DashboardShell({ children }: { children: ReactNode }): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, user } = useAdminAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [restaurantName, setRestaurantName] = useState(DEFAULT_RESTAURANT_NAME);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const restaurantsService = useMemo(() => new RestaurantsService({ scope: "admin" }), []);

  useEffect(() => {
    let alive = true;
    if (user?.restaurantId) {
      restaurantsService.getByRestaurantId(user.restaurantId)
        .then((restaurant) => { if (alive) setRestaurantName(resolveRestaurantDisplayName(restaurant?.name)); })
        .catch(() => undefined);
    }
    const onRename = (event: Event) => setRestaurantName(resolveRestaurantDisplayName((event as CustomEvent<string>).detail));
    window.addEventListener(RESTAURANT_NAME_UPDATED_EVENT, onRename);
    return () => { alive = false; window.removeEventListener(RESTAURANT_NAME_UPDATED_EVENT, onRename); };
  }, [restaurantsService, user?.restaurantId]);

  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  const items = dashboardNavItems.filter((item) => !item.roles || (user && item.roles.includes(user.role)));
  const current = findNavItem(pathname);
  const isActive = (href: string) => (href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  const handleLogout = async () => { await logout(); router.replace("/login"); };

  const sidebarBody = (onNavigate?: () => void) => (
    <>
      <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto" aria-label="Navegação do painel">
        {NAVIGATION_GROUPS.map((group) => {
          const groupItems = items.filter((item) => item.group === group.id);
          if (!groupItems.length) return null;
          return (
            <div key={group.id} className="space-y-1">
              <p className="px-2.5 text-xs font-semibold text-[hsl(var(--foreground-muted))]">{group.label}</p>
              {groupItems.map((item) => <NavLink key={item.href} item={item} active={isActive(item.href)} onNavigate={onNavigate} />)}
            </div>
          );
        })}
      </nav>
      <div className="space-y-2 border-t border-[hsl(var(--border))] pt-3">
        <div className="px-2.5">
          <p className="truncate text-sm font-semibold">{user?.name ?? "Equipe"}</p>
          <p className="text-xs text-[hsl(var(--foreground-muted))]">{user ? ROLE_LABELS[user.role] : ""}</p>
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={() => setTheme(isDark ? "light" : "dark")} className="flex flex-1 items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-2 text-sm text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--surface-muted))]">
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}{isDark ? "Tema claro" : "Tema escuro"}
          </button>
          <button type="button" onClick={() => void handleLogout()} className="flex items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-2 text-sm text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--surface-muted))]">
            <LogOut className="h-4 w-4" />Sair
          </button>
        </div>
      </div>
    </>
  );

  const mobileTabs = items.filter((item) => item.mobileTab);

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      {/* Computer: fixed sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col gap-6 border-r border-[hsl(var(--border))] bg-[hsl(var(--background-elevated))] p-4 lg:flex">
        <Brand restaurantName={restaurantName} />
        {sidebarBody()}
      </aside>

      {/* Phone: drawer with everything else */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Fechar menu" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[min(86vw,300px)] flex-col gap-6 bg-[hsl(var(--background-elevated))] p-4">
            <div className="flex items-start justify-between gap-2">
              <Brand restaurantName={restaurantName} />
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Fechar menu" className="rounded-lg p-2 hover:bg-[hsl(var(--surface-muted))]"><X className="h-5 w-5" /></button>
            </div>
            {sidebarBody(() => setDrawerOpen(false))}
          </aside>
        </div>
      ) : null}

      <div className="min-w-0 pb-24 lg:pb-0">
        <header className="sticky top-0 z-30 border-b border-[hsl(var(--border))] bg-[hsl(var(--background)/0.92)] backdrop-blur">
          <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 lg:px-8 lg:py-5">
            <button type="button" onClick={() => setDrawerOpen(true)} aria-label="Abrir menu" className="-ml-1 rounded-lg p-2 hover:bg-[hsl(var(--surface-muted))] lg:hidden"><Menu className="h-5 w-5" /></button>
            {current ? <AppIconBadge icon={current.icon} tone={current.tone} className="hidden sm:inline-flex" /> : null}
            <div className="min-w-0">
              <h1 className="truncate text-xl lg:text-2xl">{current?.label ?? "Painel"}</h1>
              {current?.description ? <p className="hidden truncate text-sm text-[hsl(var(--foreground-muted))] sm:block">{current.description}</p> : null}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] space-y-5 px-4 py-5 lg:px-8 lg:py-6">
          {current?.roles && user && !current.roles.includes(user.role) ? (
            // The menu hides these areas; opening the address directly used to show permission errors.
            <div className="app-surface mx-auto max-w-md space-y-2 p-6 text-center">
              <p className="text-lg font-semibold">Você não tem acesso a esta área</p>
              <p className="text-sm text-[hsl(var(--foreground-muted))]">A sua função ({ROLE_LABELS[user.role]}) não usa {current.label}. Se precisar, peça ao administrador do restaurante.</p>
              <Link href="/dashboard" className="inline-block pt-2 text-sm font-semibold text-[hsl(var(--primary))] underline">Voltar ao início</Link>
            </div>
          ) : children}
        </main>
      </div>

      {/* Phone: bottom tab bar for the waiter */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[hsl(var(--border))] bg-[hsl(var(--background-elevated)/0.97)] pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Atalhos">
        <div className="mx-auto grid max-w-md" style={{ gridTemplateColumns: `repeat(${mobileTabs.length + 1}, minmax(0, 1fr))` }}>
          {mobileTabs.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium", active ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--foreground-muted))]")}>
                <Icon className="h-6 w-6" aria-hidden="true" />{item.label}
              </Link>
            );
          })}
          <button type="button" onClick={() => setDrawerOpen(true)} className="flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium text-[hsl(var(--foreground-muted))]">
            <MoreHorizontal className="h-6 w-6" aria-hidden="true" />Mais
          </button>
        </div>
      </nav>
    </div>
  );
}
