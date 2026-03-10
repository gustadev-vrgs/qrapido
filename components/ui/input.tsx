import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  return <input className={cn("w-full rounded-xl border border-white/10 bg-graphite-900 px-3 py-2 text-sm", className)} {...props} />;
}
