import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: ReactNode }): JSX.Element {
  return <section className={cn("surface p-5", className)}>{children}</section>;
}
