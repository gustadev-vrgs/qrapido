import "server-only";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export type ApiFailureCode =
  | "firestore_index_missing"
  | "firestore_permission"
  | "firestore_api_disabled"
  | "firestore_database_missing"
  | "firestore_datastore_mode"
  | "firestore_unavailable"
  | "server_config"
  | "internal_error";

/** Recognizes the infrastructure failures that used to surface as a bare 500 page. */
export function classifyServerError(error: unknown): { code: ApiFailureCode; status: number; hint: string } {
  const record = (typeof error === "object" && error !== null ? error : {}) as { code?: unknown; message?: unknown; name?: unknown; details?: unknown };
  const message = [record.message, record.details].filter((part): part is string => typeof part === "string").join(" ");
  const code = record.code;
  // The key parses but Google refuses it: deleted/revoked key, deleted service account or a clock problem.
  if (code === 16 || code === "unauthenticated" || /UNAUTHENTICATED|invalid_grant|invalid JWT|account not found|Could not refresh access token/i.test(message)) {
    return { code: "server_config", status: 503, hint: "O Google recusou a chave da conta de serviço (chave apagada, revogada ou de uma conta que não existe mais). Gere uma nova chave e atualize FIREBASE_SERVICE_ACCOUNT na Vercel." };
  }
  if (record.name === "FirebaseAdminConfigError" || code === "firebase_admin_config" || /credential|private key|PEM|DECODER/i.test(message)) {
    return { code: "server_config", status: 503, hint: "Credenciais do Firebase Admin ausentes ou inválidas nas variáveis de ambiente do servidor." };
  }
  if (/SERVICE_DISABLED|has not been used in project|API .* is disabled/i.test(message)) {
    return { code: "firestore_api_disabled", status: 503, hint: "A API do Cloud Firestore está desativada neste projeto do Google Cloud." };
  }
  if (/Datastore Mode/i.test(message)) {
    return { code: "firestore_datastore_mode", status: 503, hint: "O banco deste projeto está no modo Datastore; o sistema precisa do Firestore em modo nativo." };
  }
  if (code === 5 && /database/i.test(message) || /database \(default\) does not exist|database .* not found/i.test(message)) {
    return { code: "firestore_database_missing", status: 503, hint: "O banco Firestore (default) não existe neste projeto Firebase." };
  }
  if (code === 9 || code === "failed-precondition" || /FAILED_PRECONDITION|requires an index/i.test(message)) {
    return { code: "firestore_index_missing", status: 503, hint: "O Firestore precisa de um índice que ainda não foi publicado." };
  }
  if (code === 7 || code === "permission-denied" || /PERMISSION_DENIED/i.test(message)) {
    return { code: "firestore_permission", status: 503, hint: "A conta de serviço não tem permissão no Firestore deste projeto." };
  }
  if (code === 14 || code === 4 || /UNAVAILABLE|DEADLINE_EXCEEDED|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN/i.test(message)) {
    return { code: "firestore_unavailable", status: 503, hint: "O servidor não conseguiu se conectar ao Firestore (rede ou instabilidade do Google). Tente de novo em instantes." };
  }
  return { code: "internal_error", status: 500, hint: "Erro inesperado no servidor." };
}

/** Short, credential-free summary of an error for the diagnostics screen. */
export function describeErrorForDiagnostics(error: unknown): string {
  const record = (typeof error === "object" && error !== null ? error : {}) as { code?: unknown; message?: unknown };
  const raw = typeof record.message === "string" ? record.message : String(error);
  const cleaned = raw
    .replace(/-----BEGIN[\s\S]*?(-----END[^-]*-----|$)/g, "[chave omitida]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  const code = typeof record.code === "string" || typeof record.code === "number" ? `[${record.code}] ` : "";
  return `${code}${cleaned}`;
}

export function logServerFailure(route: string, requestId: string, error: unknown): void {
  const message = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
  console.error(JSON.stringify({ level: "error", event: "api_request_failed", route, requestId, error: message }));
}

/** Next.js uses thrown errors with a `digest` for control flow (dynamic rendering, redirects, notFound): never swallow them. */
function isNextInternalError(error: unknown): boolean {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : "";
  return digest === "DYNAMIC_SERVER_USAGE" || digest.startsWith("NEXT_") || digest.startsWith("BAILOUT_");
}

/**
 * Wraps a route handler so unexpected failures become JSON the browser can show,
 * with a requestId that matches the Vercel log line.
 */
export function withApiErrors<Args extends unknown[]>(route: string, handler: (...args: Args) => Promise<NextResponse>, publicMessage = "O sistema do restaurante está temporariamente indisponível. Avise a equipe.") {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (isNextInternalError(error)) throw error;
      const requestId = randomUUID();
      logServerFailure(route, requestId, error);
      const failure = classifyServerError(error);
      return NextResponse.json({ error: publicMessage, code: failure.code, hint: failure.hint, requestId }, { status: failure.status, headers: { "Cache-Control": "no-store", "x-request-id": requestId } });
    }
  };
}
