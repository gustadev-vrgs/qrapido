import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import type { StaffUser, UserRole } from "@/lib/types/domain";

export const ADMIN_ROLES: UserRole[] = ["admin", "manager"];
export const STAFF_ROLES: UserRole[] = ["admin", "manager", "attendant", "kitchen"];

export interface VerifiedStaffRequest {
  uid: string;
  email: string | null;
  staffUser: StaffUser;
}

function authError(message: string, status = 401): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

function getBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

export async function requireStaffRequest(request: NextRequest, allowedRoles: UserRole[] = STAFF_ROLES): Promise<VerifiedStaffRequest | NextResponse> {
  const idToken = getBearerToken(request);
  if (!idToken) return authError("Sessão expirada ou ausente. Faça login novamente.");

  try {
    const auth = getFirebaseAdminAuth() as { verifyIdToken: (token: string) => Promise<{ uid: string; email?: string | null }> };
    const decoded = await auth.verifyIdToken(idToken);
    const db = getFirebaseAdminFirestore() as any;

    const byId = await db.collection("staffUsers").doc(decoded.uid).get();
    let staffDoc = byId.exists ? byId : null;
    if (!staffDoc) {
      const byUid = await db.collection("staffUsers").where("uid", "==", decoded.uid).where("isActive", "==", true).limit(1).get();
      staffDoc = byUid.empty ? null : byUid.docs[0];
    }

    if (!staffDoc?.exists) return authError("Usuário sem cadastro ativo na equipe.", 403);

    const staffUser = { id: staffDoc.id, ...staffDoc.data() } as StaffUser;
    if (!staffUser.isActive || staffUser.uid !== decoded.uid) return authError("Usuário sem cadastro ativo na equipe.", 403);
    if (!allowedRoles.includes(staffUser.role)) return authError("Você não tem permissão para esta operação.", 403);

    return { uid: decoded.uid, email: decoded.email ?? null, staffUser };
  } catch (error) {
    if (process.env.NODE_ENV === "development") console.error("Admin auth validation failed", error);
    return authError("Não foi possível validar sua sessão. Faça login novamente.");
  }
}
