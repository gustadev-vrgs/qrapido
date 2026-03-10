import type { ReactNode } from "react";
import { AppPageHeader, AppSectionCard } from "@/components/ui/app-design-system";

interface PageShellProps {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
}

export function PageShell({ eyebrow, title, description, children }: PageShellProps): JSX.Element {
  return (
    <section>
      <AppPageHeader eyebrow={eyebrow} title={title} description={description} />
      {children ? <AppSectionCard title="Conteúdo" description="Componentes e dados desta seção serão conectados nas próximas etapas.">{children}</AppSectionCard> : null}
    </section>
  );
}
