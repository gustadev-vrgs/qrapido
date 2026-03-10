import type { ReactNode } from "react";
"use client";

import { AdminShell } from "@/components/layout/admin-shell";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";

export default function AdminLayout({ children }: { children: ReactNode }): JSX.Element {
  useAuthGuard();
  return <AdminShell>{children}</AdminShell>;
}
