"use client";

import { useCallback } from "react";

import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import { getFirebaseClientAuth } from "@/lib/firebase/client";

export class AdminApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string, public readonly hint?: string) {
    super(message);
    this.name = "AdminApiError";
  }
}

const FALLBACK_BY_STATUS: Record<number, string> = {
  401: "Sua sessão expirou. Faça login novamente.",
  403: "Seu usuário não tem permissão para esta ação.",
  404: "Registro não encontrado. Atualize a tela.",
  409: "A operação conflita com o estado atual. Atualize a tela.",
  503: "O servidor está com um problema de configuração. Veja Configurações → Diagnóstico."
};

/** Calls the /api/admin routes with the staff ID token; retries once with a fresh token on 401. */
export function useAdminApi() {
  const { firebaseUser } = useAdminAuth();

  return useCallback(async <T = Record<string, unknown>>(url: string, body?: unknown, method: "GET" | "POST" = body === undefined ? "GET" : "POST"): Promise<T> => {
    const user = firebaseUser ?? getFirebaseClientAuth().currentUser;
    if (!user) throw new AdminApiError("Sessão administrativa ausente. Faça login novamente.", 401);
    const send = async (force: boolean) => fetch(url, {
      method,
      cache: "no-store",
      headers: { authorization: `Bearer ${await user.getIdToken(force)}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let response = await send(false);
    if (response.status === 401) response = await send(true);
    const payload = await response.json().catch(() => null) as (T & { error?: string; code?: string; hint?: string }) | null;
    if (!response.ok) {
      const message = payload?.error ?? FALLBACK_BY_STATUS[response.status] ?? `Falha na requisição (${response.status}).`;
      throw new AdminApiError(payload?.hint && payload.code !== undefined ? `${message} ${payload.hint}` : message, response.status, payload?.code, payload?.hint);
    }
    return (payload ?? {}) as T;
  }, [firebaseUser]);
}
