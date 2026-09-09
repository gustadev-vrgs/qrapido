import "server-only";

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { USER_ROLES, type StaffUser, type UserRole } from "@/lib/types/domain";

export const ADMIN_ROLES: UserRole[] = ["admin", "manager"];
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

function isInvalidToken(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  return code.startsWith("auth/id-token-") || code === "auth/argument-error";
}

export function logAdminFailure(id: string, stage: string, error: unknown): void {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "unknown";
  console.error(JSON.stringify({ level: "error", event: "admin_request_failed", requestId: id, stage, code }));
}

export async function requireStaffRequest(request: NextRequest, allowedRoles: UserRole[] = STAFF_ROLES): Promise<VerifiedStaffRequest | NextResponse> {
  const id = requestId(request);
  const idToken = bearer(request);
  if (!idToken) return response("Autenticação ausente ou inválida.", 401, id, "invalid_token");

  let decoded: { uid: string; email?: string | null };
  try {
    decoded = await (getFirebaseAdminAuth() as { verifyIdToken(token: string): Promise<{ uid: string; email?: string | null }> }).verifyIdToken(idToken);
  } catch (error) {
    if (isInvalidToken(error)) return response("Sua sessão expirou. Faça login novamente.", 401, id, "invalid_token");
    logAdminFailure(id, "verify_token", error);
    return response("Serviço de autenticação temporariamente indisponível.", 500, id, "auth_infrastructure_error");
  }

  try {
    const snapshot = await (getFirebaseAdminFirestore() as any).collection("staffUsers").doc(decoded.uid).get();
    if (!snapshot.exists) return response("Usuário sem cadastro ativo na equipe.", 403, id, "staff_not_found");
    const staffUser = { id: snapshot.id, ...snapshot.data() } as StaffUser;
    const validRole = USER_ROLES.includes(staffUser.role);
    if (staffUser.uid !== decoded.uid || !staffUser.isActive || !staffUser.restaurantId || !validRole) {
      return response("Cadastro de funcionário inativo ou inválido.", 403, id, "staff_inactive_or_invalid");
    }
    if (!allowedRoles.includes(staffUser.role)) return response("Você não possui permissão para esta operação.", 403, id, "insufficient_role");
    return { uid: decoded.uid, email: decoded.email ?? null, staffUser, requestId: id };
  } catch (error) {
    logAdminFailure(id, "load_staff", error);
    return response("Não foi possível validar as permissões no momento.", 500, id, "staff_infrastructure_error");
  }
}

export function forbiddenResource(requestId: string): NextResponse {
  return response("O recurso não pertence ao seu restaurante.", 403, requestId, "restaurant_mismatch");
}
