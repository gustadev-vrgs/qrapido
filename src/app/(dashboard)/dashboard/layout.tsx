import type { ReactNode } from "react";
import { DashboardShell } from "@/components/shared/dashboard-shell";

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps): JSX.Element {
  return <DashboardShell>{children}</DashboardShell>;
}
