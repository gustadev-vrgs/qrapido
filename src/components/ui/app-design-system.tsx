import { forwardRef, type ComponentProps, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Inbox, Search, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type SurfaceVariant = "default" | "strong";

interface AppSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SurfaceVariant;
}

export function AppSurface({ variant = "default", className, ...props }: AppSurfaceProps): JSX.Element {
  return <div className={cn(variant === "strong" ? "app-surface-strong" : "app-surface", className)} {...props} />;
}

/** Color families used for icons, stat tiles and badges. */
export type AppTone = "primary" | "success" | "warning" | "danger" | "info" | "neutral";

const toneIcon: Record<AppTone, string> = {
  primary: "bg-[hsl(var(--primary-soft))] text-[hsl(var(--primary))]",
  success: "bg-[hsl(var(--success)/0.14)] text-[hsl(var(--success))]",
  warning: "bg-[hsl(var(--gema)/0.2)] text-[hsl(var(--warning))]",
  danger: "bg-[hsl(var(--danger)/0.12)] text-[hsl(var(--danger))]",
  info: "bg-[hsl(var(--primary-soft))] text-[hsl(var(--info))]",
  neutral: "bg-[hsl(var(--surface-muted))] text-[hsl(var(--foreground-muted))]"
};

export function AppIconBadge({ icon: Icon, tone = "primary", size = "md", className }: { icon: LucideIcon; tone?: AppTone; size?: "sm" | "md" | "lg"; className?: string }): JSX.Element {
  const box = size === "lg" ? "h-12 w-12 rounded-2xl" : size === "sm" ? "h-8 w-8 rounded-lg" : "h-10 w-10 rounded-xl";
  const glyph = size === "lg" ? "h-6 w-6" : size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return <span className={cn("inline-flex shrink-0 items-center justify-center", box, toneIcon[tone], className)} aria-hidden="true"><Icon className={glyph} /></span>;
}

interface AppPageHeaderProps {
  /** Kept for compatibility; no longer rendered as an all-caps label. */
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: LucideIcon;
}

export function AppPageHeader({ title, description, actions, icon }: AppPageHeaderProps): JSX.Element {
  return (
    <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="flex items-start gap-3">
        {icon ? <AppIconBadge icon={icon} size="lg" /> : null}
        <div className="space-y-1">
          <h1>{title}</h1>
          {description ? <p className="max-w-2xl text-[hsl(var(--foreground-muted))]">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

interface AppSectionCardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: LucideIcon;
  tone?: AppTone;
}

export function AppSectionCard({ title, description, action, icon, tone = "primary", className, children, ...props }: AppSectionCardProps): JSX.Element {
  return (
    <AppSurface className={cn("p-4 md:p-6", className)} {...props}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? <AppIconBadge icon={icon} tone={tone} /> : null}
          <div className="min-w-0">
            <h2>{title}</h2>
            {description ? <p className="mt-1 text-sm text-[hsl(var(--foreground-muted))]">{description}</p> : null}
          </div>
        </div>
        {action}
      </header>
      {children}
    </AppSurface>
  );
}

interface AppStatCardProps {
  label: string;
  value: string;
  trend?: string;
  icon?: LucideIcon;
  tone?: AppTone;
}

export function AppStatCard({ label, value, trend, icon, tone = "primary" }: AppStatCardProps): JSX.Element {
  return (
    <AppSurface className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:gap-3 md:p-5">
      {icon ? <AppIconBadge icon={icon} tone={tone} className="h-9 w-9 rounded-lg md:h-10 md:w-10 md:rounded-xl" /> : null}
      <div className="min-w-0">
        <p className="text-sm leading-tight text-[hsl(var(--foreground-muted))]">{label}</p>
        <p className="num mt-0.5 text-xl font-bold leading-tight sm:text-2xl md:text-[1.75rem]">{value}</p>
        {trend ? <p className="mt-1 text-xs text-[hsl(var(--foreground-muted))]">{trend}</p> : null}
      </div>
    </AppSurface>
  );
}

interface AppEmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: LucideIcon;
}

export function AppEmptyState({ title, description, action, icon = Inbox }: AppEmptyStateProps): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-[hsl(var(--border-strong))] px-6 py-10 text-center">
      <AppIconBadge icon={icon} tone="neutral" size="lg" />
      <h3>{title}</h3>
      <p className="max-w-md text-sm text-[hsl(var(--foreground-muted))]">{description}</p>
      {action}
    </div>
  );
}

interface AppSkeletonProps {
  className?: string;
}

export function AppSkeleton({ className }: AppSkeletonProps): JSX.Element {
  return <div className={cn("animate-pulse rounded-[var(--radius-md)] bg-[hsl(var(--surface-muted))]", className)} aria-hidden="true" />;
}

const badgeMap = {
  success: "bg-[hsl(var(--success)/0.13)] text-[hsl(var(--success))]",
  warning: "bg-[hsl(var(--gema)/0.2)] text-[hsl(var(--warning))]",
  danger: "bg-[hsl(var(--danger)/0.12)] text-[hsl(var(--danger))]",
  info: "bg-[hsl(var(--primary-soft))] text-[hsl(var(--info))]",
  neutral: "bg-[hsl(var(--surface-muted))] text-[hsl(var(--foreground-muted))]",
  primary: "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
} as const;

type BadgeTone = keyof typeof badgeMap;

interface AppStatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function AppStatusBadge({ tone = "neutral", className, ...props }: AppStatusBadgeProps): JSX.Element {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", badgeMap[tone], className)} {...props} />;
}

export function AppSearchInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--foreground-muted))]" />
      <input className="app-field pl-9" type="search" {...props} />
    </div>
  );
}

export function AppFilterBar({ className, children, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div className={cn("mb-4 flex flex-col gap-3 md:flex-row md:items-center", className)} {...props}>
      {children}
    </div>
  );
}

/** Segmented filter chips with optional counts (replaces ad-hoc button rows). */
export function AppChips<T extends string>({ value, options, onChange, className }: { value: T; options: Array<{ value: T; label: string; count?: number; icon?: LucideIcon }>; onChange: (value: T) => void; className?: string }): JSX.Element {
  return (
    <div className={cn("-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0", className)} role="tablist">
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <button key={option.value} type="button" role="tab" aria-selected={active} onClick={() => onChange(option.value)}
            className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-colors",
              active ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" : "border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary)/0.5)]")}>
            {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
            {option.label}
            {option.count !== undefined ? <span className={cn("num rounded-full px-1.5 text-xs", active ? "bg-white/20" : "bg-[hsl(var(--surface-muted))]")}>{option.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

interface AppDataCardProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  metadata?: string;
  status?: ReactNode;
}

export function AppDataCard({ title, metadata, status, className, children, ...props }: AppDataCardProps): JSX.Element {
  return (
    <AppSurface className={cn("p-4", className)} {...props}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3>{title}</h3>
        {status}
      </div>
      {metadata ? <p className="mb-2 text-sm text-[hsl(var(--foreground-muted))]">{metadata}</p> : null}
      {children}
    </AppSurface>
  );
}

const buttonStyles = {
  primary: "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary)/0.9)] active:translate-y-px",
  secondary: "border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-muted))]",
  ghost: "bg-transparent text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--surface-muted))] hover:text-[hsl(var(--foreground))]",
  destructive: "bg-[hsl(var(--danger)/0.1)] text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger)/0.18)]",
  success: "bg-[hsl(var(--success))] text-white hover:bg-[hsl(var(--success)/0.9)] active:translate-y-px"
} as const;

type AppActionButtonVariant = keyof typeof buttonStyles;

interface AppActionButtonProps extends ComponentProps<"button"> {
  variant?: AppActionButtonVariant;
}

export function AppActionButton({ variant = "primary", className, type = "button", ...props }: AppActionButtonProps): JSX.Element {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--focus-ring)/0.5)] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--background))] disabled:pointer-events-none disabled:opacity-50",
        buttonStyles[variant],
        className
      )}
      {...props}
    />
  );
}

interface AppFormFieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export function AppFormField({ label, hint, error, children }: AppFormFieldProps): JSX.Element {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {error ? <span className="block text-xs text-[hsl(var(--danger))]">{error}</span> : hint ? <span className="block text-xs text-[hsl(var(--foreground-muted))]">{hint}</span> : null}
    </label>
  );
}

export const AppTextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function AppTextInput({ className, ...props }, ref): JSX.Element {
  return <input ref={ref} className={cn("app-field", className)} {...props} />;
});

export const AppTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function AppTextarea({ className, ...props }, ref): JSX.Element {
  return <textarea ref={ref} className={cn("app-field min-h-24 resize-y py-2.5", className)} {...props} />;
});

export const AppSelect = forwardRef<HTMLSelectElement, ComponentProps<"select">>(function AppSelect({ className, ...props }, ref): JSX.Element {
  return <select ref={ref} className={cn("app-field", className)} {...props} />;
});

export function MobileStickyBar({ className, children, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div className={cn("sticky bottom-3 z-10 mx-auto w-full max-w-md rounded-[var(--radius-lg)] border border-[hsl(var(--border))] bg-[hsl(var(--background-elevated)/0.97)] p-3 shadow-[0_8px_30px_-12px_hsl(217_28%_15%/0.35)] backdrop-blur", className)} {...props}>
      {children}
    </div>
  );
}

interface MobileSectionTitleProps {
  eyebrow?: string;
  title: string;
  description?: string;
}

export function MobileSectionTitle({ title, description }: MobileSectionTitleProps): JSX.Element {
  return (
    <div className="space-y-1">
      <h2>{title}</h2>
      {description ? <p className="text-sm text-[hsl(var(--foreground-muted))]">{description}</p> : null}
    </div>
  );
}
