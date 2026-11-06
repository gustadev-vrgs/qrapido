"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useAdminAuth } from "@/lib/hooks/use-admin-auth";

interface AdminRouteGuardProps {
  children: ReactNode;
}

export function AdminRouteGuard({ children }: AdminRouteGuardProps): JSX.Element {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useAdminAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    // Usually takes a fraction of a second: the message only shows up if it takes longer,
    // so a normal page load does not flash a box before the panel appears.
    return <div className="min-h-screen bg-[hsl(var(--background))]"><div className="app-delayed-appear app-surface mx-auto mt-10 max-w-md p-5 text-sm text-[hsl(var(--foreground-muted))]" role="status">Validando sessão...</div></div>;
  }

  if (!isAuthenticated) {
    return <div className="sr-only">Redirecionando...</div>;
  }

  return <>{children}</>;
}
