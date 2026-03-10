import { cn } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: React.ReactNode }): JSX.Element {
  return <section className={cn("surface p-5", className)}>{children}</section>;
}
