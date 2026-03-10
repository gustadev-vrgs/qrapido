import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

const buttonVariants = {
  default: "bg-emeraldAccent-500 text-graphite-950 hover:bg-emeraldAccent-400",
  secondary: "bg-white/10 text-white hover:bg-white/15",
  ghost: "bg-transparent text-graphite-100 hover:bg-white/10",
  danger: "bg-rose-500/90 text-white hover:bg-rose-500"
} as const;

type ButtonVariant = keyof typeof buttonVariants;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "default", type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        buttonVariants[variant],
        className
      )}
      {...props}
    />
  );
});
