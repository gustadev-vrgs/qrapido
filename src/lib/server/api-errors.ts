import "server-only";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export type ApiFailureCode = "firestore_index_missing" | "firestore_permission" | "server_config" | "internal_error";

/** Recognizes the infrastructure failures that used to surface as a bare 500 page. */
export function classifyServerError(error: unknown): { code: ApiFailureCode; status: number; hint: string } {
  const record = (typeof error === "object" && error !== null ? error : {}) as { code?: unknown; message?: unknown; name?: unknown };
  const message = typeof record.message === "string" ? record.message : "";
  const code = record.code;
  if (record.name === "FirebaseAdminConfigError" || code === "firebase_admin_config" || /credential|private key|PEM|DECODER/i.test(message)) {
    return { code: "server_config", status: 503, hint: "Credenciais do Firebase Admin ausentes ou inválidas nas variáveis de ambiente do servidor." };
  }
  if (code === 9 || code === "failed-precondition" || /FAILED_PRECONDITION|requires an index/i.test(message)) {
    return { code: "firestore_index_missing", status: 503, hint: "O Firestore precisa de um índice que ainda não foi publicado." };
  }
  if (code === 7 || code === "permission-denied" || /PERMISSION_DENIED/i.test(message)) {
    return { code: "firestore_permission", status: 503, hint: "A conta de serviço não tem permissão no Firestore deste projeto." };
  }
  return { code: "internal_error", status: 500, hint: "Erro inesperado no servidor." };
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
