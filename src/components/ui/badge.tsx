import type { HTMLAttributes } from "react";
import { getBadgeToneClass } from "@/lib/helpers/badge";
import type { BadgeTone } from "@/lib/constants/badge-variants";
import { cn } from "@/lib/utils/cn";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = "default", className, ...props }: BadgeProps): JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium uppercase tracking-wide",
        getBadgeToneClass(tone),
        className
      )}
      {...props}
    />
  );
}
