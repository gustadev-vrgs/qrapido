import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost";
}

export function Button({ className, variant = "primary", ...props }: ButtonProps): JSX.Element {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition",
        variant === "primary"
          ? "bg-emeraldAccent-500 text-graphite-950 hover:bg-emeraldAccent-400"
          : "bg-transparent text-graphite-200 hover:bg-white/10",
        className
      )}
      {...props}
    />
  );
}
