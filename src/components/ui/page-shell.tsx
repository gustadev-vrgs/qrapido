import type { ReactNode } from "react";

interface PageShellProps {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
}

export function PageShell({ eyebrow, title, description, children }: PageShellProps): JSX.Element {
  return (
    <section className="surface min-h-[220px] p-6 md:p-8">
      <header className="mb-6 space-y-2 border-b border-white/10 pb-4">
        {eyebrow ? <p className="text-xs uppercase tracking-[0.16em] text-emeraldAccent-300">{eyebrow}</p> : null}
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        <p className="max-w-2xl text-sm text-graphite-300 md:text-base">{description}</p>
      </header>
      {children ? <div>{children}</div> : null}
    </section>
  );
}
