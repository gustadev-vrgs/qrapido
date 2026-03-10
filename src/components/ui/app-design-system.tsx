import type { ComponentProps, HTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type SurfaceVariant = "default" | "strong";

interface AppSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SurfaceVariant;
}

export function AppSurface({ variant = "default", className, ...props }: AppSurfaceProps): JSX.Element {
  return <div className={cn(variant === "strong" ? "app-surface-strong" : "app-surface", className)} {...props} />;
}

interface AppPageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function AppPageHeader({ eyebrow, title, description, actions }: AppPageHeaderProps): JSX.Element {
  return (
    <AppSurface variant="strong" className="mb-4 flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between md:p-7">
      <div className="space-y-2">
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[hsl(var(--foreground-muted))]">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="max-w-2xl text-sm text-[hsl(var(--foreground-muted))] md:text-base">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </AppSurface>
  );
}

interface AppSectionCardProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function AppSectionCard({ title, description, action, className, children, ...props }: AppSectionCardProps): JSX.Element {
  return (
    <AppSurface className={cn("p-5 md:p-6", className)} {...props}>
      <header className="mb-4 flex items-start justify-between gap-3 border-b border-[hsl(var(--border))] pb-4">
        <div>
          <h2 className="text-lg md:text-xl">{title}</h2>
          {description ? <p className="mt-1 text-sm text-[hsl(var(--foreground-muted))]">{description}</p> : null}
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
}

export function AppStatCard({ label, value, trend }: AppStatCardProps): JSX.Element {
  return (
    <AppSurface className="p-4 md:p-5">
      <p className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--foreground-muted))]">{label}</p>
      <p className="mt-3 text-2xl font-semibold md:text-3xl">{value}</p>
      {trend ? <p className="mt-2 text-xs text-[hsl(var(--foreground-muted))]">{trend}</p> : null}
    </AppSurface>
  );
}

interface AppEmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function AppEmptyState({ title, description, action }: AppEmptyStateProps): JSX.Element {
  return (
    <AppSurface className="flex flex-col items-start gap-3 border-dashed p-6 md:p-8">
      <span className="rounded-full border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))] px-3 py-1 text-xs uppercase tracking-[0.16em] text-[hsl(var(--foreground-muted))]">
        Sem dados
      </span>
      <h3>{title}</h3>
      <p className="max-w-lg text-sm text-[hsl(var(--foreground-muted))]">{description}</p>
      {action}
    </AppSurface>
  );
}

interface AppSkeletonProps {
  className?: string;
}

export function AppSkeleton({ className }: AppSkeletonProps): JSX.Element {
  return <div className={cn("animate-pulse rounded-xl bg-[hsl(var(--surface-muted))]", className)} aria-hidden="true" />;
}

const badgeMap = {
  success: "border-[hsl(var(--success)/0.35)] bg-[hsl(var(--success)/0.16)] text-[hsl(var(--success))]",
  warning: "border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.16)] text-[hsl(var(--warning))]",
  danger: "border-[hsl(var(--danger)/0.35)] bg-[hsl(var(--danger)/0.16)] text-[hsl(var(--danger))]",
  info: "border-[hsl(var(--info)/0.35)] bg-[hsl(var(--info)/0.16)] text-[hsl(var(--info))]",
  neutral: "border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))] text-[hsl(var(--foreground-muted))]"
} as const;

type BadgeTone = keyof typeof badgeMap;

interface AppStatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function AppStatusBadge({ tone = "neutral", className, ...props }: AppStatusBadgeProps): JSX.Element {
  return (
    <span
      className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium uppercase tracking-[0.12em]", badgeMap[tone], className)}
      {...props}
    />
  );
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
    <AppSurface className={cn("mb-4 flex flex-col gap-3 p-4 md:flex-row md:items-center", className)} {...props}>
      {children}
    </AppSurface>
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
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-medium">{title}</h3>
        {status}
      </div>
      {metadata ? <p className="mb-3 text-xs text-[hsl(var(--foreground-muted))]">{metadata}</p> : null}
      {children}
    </AppSurface>
  );
}

const buttonStyles = {
  primary:
    "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:brightness-105 active:brightness-95 border border-transparent",
  secondary: "border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface))]",
  ghost: "border border-transparent bg-transparent text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--surface-muted))] hover:text-[hsl(var(--foreground))]",
  destructive: "border border-[hsl(var(--danger)/0.45)] bg-[hsl(var(--danger)/0.14)] text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger)/0.22)]"
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
        "inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--focus-ring)/0.4)] disabled:pointer-events-none disabled:opacity-50",
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
    <label className="block space-y-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {error ? <span className="text-xs text-[hsl(var(--danger))]">{error}</span> : hint ? <span className="text-xs text-[hsl(var(--foreground-muted))]">{hint}</span> : null}
    </label>
  );
}

export function AppTextInput(props: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  return <input className="app-field" {...props} />;
}

export function AppTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>): JSX.Element {
  return <textarea className="app-field min-h-24 resize-y py-2.5" {...props} />;
}

export function AppSelect(props: ComponentProps<"select">): JSX.Element {
  return <select className="app-field" {...props} />;
}

export function MobileStickyBar({ className, children, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div className={cn("sticky bottom-3 z-10 mx-auto w-full max-w-md rounded-2xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--background-elevated)/0.96)] p-3 shadow-surface backdrop-blur", className)} {...props}>
      {children}
    </div>
  );
}

interface MobileSectionTitleProps {
  eyebrow?: string;
  title: string;
  description?: string;
}

export function MobileSectionTitle({ eyebrow, title, description }: MobileSectionTitleProps): JSX.Element {
  return (
    <div className="space-y-1">
      {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--foreground-muted))]">{eyebrow}</p> : null}
      <h2 className="text-xl">{title}</h2>
      {description ? <p className="text-sm text-[hsl(var(--foreground-muted))]">{description}</p> : null}
    </div>
  );
}
