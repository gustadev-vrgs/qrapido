import "server-only";

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { classifyServerError } from "@/lib/server/api-errors";
import { USER_ROLES, type StaffUser, type UserRole } from "@/lib/types/domain";

export const ADMIN_ROLES: UserRole[] = ["admin", "manager"];
/** Irreversible actions on the restaurant's data: the owner/administrator only. */
export const OWNER_ROLES: UserRole[] = ["admin"];
/** Who runs the floor: opens and closes tables, gives codes, answers calls. */
export const FLOOR_ROLES: UserRole[] = ["admin", "manager", "attendant"];
export const STAFF_ROLES: UserRole[] = [...USER_ROLES];

export interface VerifiedStaffRequest { uid: string; email: string | null; staffUser: StaffUser; requestId: string }

function response(message: string, status: number, requestId: string, code: string): NextResponse {
  return NextResponse.json({ error: message, code, requestId }, { status, headers: { "x-request-id": requestId } });
}

function bearer(request: NextRequest): string | null {
  const match = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

function requestId(request: NextRequest): string {
  const supplied = request.headers.get("x-request-id");
  return supplied && /^[a-zA-Z0-9_-]{8,80}$/.test(supplied) ? supplied : randomUUID();
}

function errorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "";
}

function isInvalidToken(error: unknown): boolean {
  const code = errorCode(error);
  return code.startsWith("auth/id-token-") || code === "auth/argument-error";
}

/** A token issued by another Firebase project fails with an "aud"/"iss" claim error: that is a server setup problem, not an expired login. */
function isProjectMismatch(error: unknown): boolean {
  return /incorrect "aud"|incorrect "iss"|same Firebase project/i.test(errorMessage(error)) && isInvalidToken(error);
}

export function logAdminFailure(id: string, stage: string, error: unknown): void {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "unknown";
  const message = error instanceof Error ? error.message.slice(0, 300) : "";
  console.error(JSON.stringify({ level: "error", event: "admin_request_failed", requestId: id, stage, code, message }));
}

export async function requireStaffRequest(request: NextRequest, allowedRoles: UserRole[] = STAFF_ROLES): Promise<VerifiedStaffRequest | NextResponse> {
  const id = requestId(request);
  const idToken = bearer(request);
  if (!idToken) return response("Autenticação ausente ou inválida.", 401, id, "invalid_token");

  let decoded: { uid: string; email?: string | null };
  try {
    decoded = await (getFirebaseAdminAuth() as { verifyIdToken(token: string): Promise<{ uid: string; email?: string | null }> }).verifyIdToken(idToken);
  } catch (error) {
    if (isProjectMismatch(error)) {
      logAdminFailure(id, "verify_token_project_mismatch", error);
      return response("O servidor está configurado com outro projeto Firebase. Confira FIREBASE_PROJECT_ID e a conta de serviço na Vercel (veja Configurações → Diagnóstico).", 503, id, "server_config");
    }
    if (isInvalidToken(error)) return response("Sua sessão expirou. Faça login novamente.", 401, id, "invalid_token");
    logAdminFailure(id, "verify_token", error);
    if (errorCode(error) === "firebase_admin_config" || (error as { name?: string })?.name === "FirebaseAdminConfigError") {
      return response("O servidor está sem as credenciais do Firebase Admin. Configure as variáveis na Vercel (veja Configurações → Diagnóstico).", 503, id, "server_config");
    }
    return response("Serviço de autenticação temporariamente indisponível.", 500, id, "auth_infrastructure_error");
  }

  try {
    const snapshot = await (getFirebaseAdminFirestore() as any).collection("staffUsers").doc(decoded.uid).get();
    if (!snapshot.exists) return response(`Usuário sem cadastro na equipe (staffUsers/${decoded.uid} não existe).`, 403, id, "staff_not_found");
    const staffUser = { id: snapshot.id, ...snapshot.data() } as StaffUser;
    const validRole = USER_ROLES.includes(staffUser.role);
    if (staffUser.uid !== decoded.uid || !staffUser.isActive || !staffUser.restaurantId || !validRole) {
      return response("Cadastro de funcionário inativo ou inválido.", 403, id, "staff_inactive_or_invalid");
    }
    if (!allowedRoles.includes(staffUser.role)) return response(`Seu cargo (${staffUser.role}) não permite esta operação.`, 403, id, "insufficient_role");
    return { uid: decoded.uid, email: decoded.email ?? null, staffUser, requestId: id };
  } catch (error) {
    logAdminFailure(id, "load_staff", error);
    if (classifyServerError(error).code === "server_config") return response("O servidor está sem as credenciais do Firebase Admin. Veja Configurações → Diagnóstico.", 503, id, "server_config");
    return response("Não foi possível validar as permissões no momento.", 500, id, "staff_infrastructure_error");
  }
}

export function forbiddenResource(requestId: string): NextResponse {
  return response("O recurso não pertence ao seu restaurante.", 403, requestId, "restaurant_mismatch");
}
