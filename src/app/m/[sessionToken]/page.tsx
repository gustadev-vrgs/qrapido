"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3, Lock, MenuSquare, ReceiptText, Sparkles, UtensilsCrossed, WalletCards } from "lucide-react";

import { AppActionButton, AppDataCard, AppSkeleton, AppStatusBadge, AppSurface, MobileStickyBar } from "@/components/ui/app-design-system";
import { RestaurantsService, SessionsService } from "@/lib/data";
import type { TableSession } from "@/lib/types/domain";

interface MobileSessionPageProps {
  params: {
    sessionToken: string;
  };
}

type MobileSessionState = "loading" | "valid" | "invalid" | "expired" | "blocked" | "error";

interface SessionViewModel {
  restaurantName: string;
  tableNumber: number;
  customerName: string | null;
  sessionLabel: string;
  status: TableSession["status"];
  expiresAtLabel: string;
}

const SESSION_TOKEN_PATTERN = /^[a-zA-Z0-9_-]{16,128}$/;

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function mapSessionState(session: TableSession): MobileSessionState {
  if (session.status === "blocked") {
    return "blocked";
  }

  if (session.status === "expired" || new Date(session.expiresAt).getTime() < Date.now()) {
    return "expired";
  }

  if (session.status === "active" || session.status === "idle") {
    return "valid";
  }

  return "invalid";
}

function SessionMessageCard({
  icon,
  title,
  description,
  accent = "neutral"
}: {
  icon: JSX.Element;
  title: string;
  description: string;
  accent?: "neutral" | "warning" | "danger";
}): JSX.Element {
  const accentClass = {
    neutral: "border-[hsl(var(--border-strong))]",
    warning: "border-[hsl(var(--warning)/0.5)]",
    danger: "border-[hsl(var(--danger)/0.5)]"
  }[accent];

  return (
    <AppSurface className={`p-6 ${accentClass}`}>
      <div className="flex items-start gap-4">
        <div className="rounded-2xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))] p-3">{icon}</div>
        <div className="space-y-2">
          <h2 className="text-lg">{title}</h2>
          <p className="text-sm leading-relaxed text-[hsl(var(--foreground-muted))]">{description}</p>
        </div>
      </div>
    </AppSurface>
  );
}

export default function MobileSessionPage({ params }: MobileSessionPageProps): JSX.Element {
  const [state, setState] = useState<MobileSessionState>("loading");
  const [session, setSession] = useState<SessionViewModel | null>(null);

  const normalizedToken = useMemo(() => decodeURIComponent(params.sessionToken ?? "").trim(), [params.sessionToken]);

  useEffect(() => {
    let active = true;

    async function loadSession(): Promise<void> {
      setState("loading");

      if (!SESSION_TOKEN_PATTERN.test(normalizedToken)) {
        if (active) {
          setSession(null);
          setState("invalid");
        }
        return;
      }

      try {
        const sessionsService = new SessionsService();
        const restaurantsService = new RestaurantsService();

        const currentSession = await sessionsService.getByTokenGlobal(normalizedToken);

        if (!active) {
          return;
        }

        if (!currentSession) {
          setSession(null);
          setState("invalid");
          return;
        }

        const restaurant = await restaurantsService.getById(currentSession.restaurantId);

        if (!active) {
          return;
        }

        const nextState = mapSessionState(currentSession);

        setSession({
          restaurantName: restaurant.name,
          tableNumber: currentSession.tableNumber,
          customerName: currentSession.customerName,
          sessionLabel: currentSession.sessionLabel,
          status: currentSession.status,
          expiresAtLabel: formatDateTime(currentSession.expiresAt)
        });
        setState(nextState);
      } catch {
        if (active) {
          setSession(null);
          setState("error");
        }
      }
    }

    loadSession();

    return () => {
      active = false;
    };
  }, [normalizedToken]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_hsl(var(--surface-muted)),_hsl(var(--background))_60%)] px-4 pb-28 pt-5 text-[hsl(var(--foreground))]">
      <section className="mx-auto flex w-full max-w-md flex-col gap-4">
        <AppSurface variant="strong" className="overflow-hidden p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-muted))] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--foreground-muted))]">
              <Sparkles className="h-3.5 w-3.5" /> QRápido
            </div>
            {state === "valid" ? <AppStatusBadge tone="success">Sessão ativa</AppStatusBadge> : null}
          </div>
          <h1 className="text-2xl leading-tight">Seu pedido começa aqui</h1>
          <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--foreground-muted))]">
            Uma experiência desenhada para celular, com tudo o que você precisa para pedir com agilidade e clareza.
          </p>
        </AppSurface>

        {state === "loading" ? (
          <>
            <AppSkeleton className="h-32 w-full" />
            <AppSkeleton className="h-28 w-full" />
            <AppSkeleton className="h-24 w-full" />
          </>
        ) : null}

        {state === "valid" && session ? (
          <>
            <AppDataCard
              title={session.restaurantName}
              metadata={`Mesa ${session.tableNumber} • Expira em ${session.expiresAtLabel}`}
              status={<AppStatusBadge tone="info">{session.status}</AppStatusBadge>}
            >
              <p className="text-sm text-[hsl(var(--foreground-muted))]">{session.customerName ? `Sessão de ${session.customerName}` : "Sessão sem identificação de nome."}</p>
            </AppDataCard>

            <AppSurface className="p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[hsl(var(--foreground-muted))]">Navegação rápida</p>
              <div className="grid grid-cols-2 gap-2.5">
                <AppActionButton className="h-12 justify-start gap-2">
                  <MenuSquare className="h-4 w-4" /> Cardápio
                </AppActionButton>
                <AppActionButton variant="secondary" className="h-12 justify-start gap-2">
                  <WalletCards className="h-4 w-4" /> Carrinho
                </AppActionButton>
                <AppActionButton variant="ghost" className="h-12 justify-start gap-2">
                  <UtensilsCrossed className="h-4 w-4" /> Chamar garçom
                </AppActionButton>
                <AppActionButton variant="ghost" className="h-12 justify-start gap-2">
                  <ReceiptText className="h-4 w-4" /> Pedir conta
                </AppActionButton>
              </div>
            </AppSurface>
          </>
        ) : null}

        {state === "invalid" ? (
          <SessionMessageCard
            icon={<AlertTriangle className="h-5 w-5 text-[hsl(var(--warning))]" />}
            title="Sessão não encontrada"
            description="Este QR pode estar desatualizado ou incompleto. Peça ao atendente para gerar um novo acesso da mesa."
            accent="warning"
          />
        ) : null}

        {state === "expired" ? (
          <SessionMessageCard
            icon={<Clock3 className="h-5 w-5 text-[hsl(var(--warning))]" />}
            title="Sessão expirada"
            description="A sessão desta mesa já foi encerrada por tempo. Escaneie novamente o QR da mesa para continuar com segurança."
            accent="warning"
          />
        ) : null}

        {state === "blocked" ? (
          <SessionMessageCard
            icon={<Lock className="h-5 w-5 text-[hsl(var(--danger))]" />}
            title="Sessão temporariamente bloqueada"
            description="Identificamos uma proteção ativa para esta sessão. Chame nossa equipe para liberar um novo acesso."
            accent="danger"
          />
        ) : null}

        {state === "error" ? (
          <SessionMessageCard
            icon={<AlertTriangle className="h-5 w-5 text-[hsl(var(--danger))]" />}
            title="Não foi possível carregar a sessão"
            description="Estamos com uma instabilidade momentânea. Tente novamente em alguns instantes ou peça ajuda no salão."
            accent="danger"
          />
        ) : null}
      </section>

      {state === "valid" && session ? (
        <MobileStickyBar>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-[hsl(var(--foreground-muted))]">Sessão</p>
              <p className="text-sm font-medium">{session.sessionLabel}</p>
            </div>
            <AppActionButton className="min-w-36">Ver cardápio</AppActionButton>
          </div>
        </MobileStickyBar>
      ) : null}
    </main>
  );
}
