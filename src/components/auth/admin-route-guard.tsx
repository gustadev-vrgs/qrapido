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
    return <div className="app-surface mx-auto mt-10 max-w-md p-5 text-sm text-[hsl(var(--foreground-muted))]">Validando sessão...</div>;
  }

  if (!isAuthenticated) {
    return <div className="sr-only">Redirecionando...</div>;
  }

  return <>{children}</>;
}
