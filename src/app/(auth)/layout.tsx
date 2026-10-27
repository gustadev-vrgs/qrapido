import type { ReactNode } from "react";

import { AuthProvider } from "@/components/providers/auth-provider";

export default function AuthLayout({ children }: { children: ReactNode }): JSX.Element {
  return <AuthProvider>{children}</AuthProvider>;
}
