import type { ReactNode } from "react";
import { brand } from "@/lib/constants/theme";

interface MobileCustomerLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function MobileCustomerLayout({ title, subtitle, children }: MobileCustomerLayoutProps): JSX.Element {
  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-4 pb-8 pt-6">
      <header className="mb-6 space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-secondary">{brand.name}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </header>
      {children}
    </main>
  );
}
