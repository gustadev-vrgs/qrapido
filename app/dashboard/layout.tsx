import type { ReactNode } from "react";
import { AdminLayout } from "@/components/layout/admin-layout";

export default function DashboardLayout({ children }: { children: ReactNode }): JSX.Element {
  return <AdminLayout>{children}</AdminLayout>;
}
