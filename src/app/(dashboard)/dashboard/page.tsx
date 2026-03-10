import { PageShell } from "@/components/ui/page-shell";

export default function DashboardPage(): JSX.Element {
  return (
    <PageShell
      eyebrow="Painel"
      title="Visão geral operacional"
      description="Estrutura inicial pronta para receber KPIs em tempo real, capacidade do salão e saúde da operação do atendimento."
    />
  );
}
