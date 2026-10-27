import type { ReactNode } from "react";

import { AdminRouteGuard } from "@/components/auth/admin-route-guard";
import { AuthProvider } from "@/components/providers/auth-provider";
import { DashboardShell } from "@/components/shared/dashboard-shell";

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps): JSX.Element {
  return (
    <AuthProvider>
      <AdminRouteGuard>
        <DashboardShell>{children}</DashboardShell>
      </AdminRouteGuard>
    </AuthProvider>
  );
}
