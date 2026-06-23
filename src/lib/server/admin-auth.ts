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
  const [scheme, ...parts] = header.trim().split(/\s+/);
  const token = parts.join(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function findActiveStaffUser(db: any, user: { uid: string; email: string | null }): Promise<StaffUser | null> {
  const byId = await db.collection("staffUsers").doc(user.uid).get();
  if (byId.exists) {
    const staffUser = { id: byId.id, ...byId.data() } as StaffUser;
    if (staffUser.isActive && staffUser.uid === user.uid) return staffUser;
  }

  const byUid = await db.collection("staffUsers").where("uid", "==", user.uid).where("isActive", "==", true).limit(1).get();
  if (!byUid.empty) {
    const doc = byUid.docs[0];
    const staffUser = { id: doc.id, ...doc.data() } as StaffUser;
    if (staffUser.uid === user.uid) return staffUser;
  }

  if (!user.email) return null;

  const candidateEmails = Array.from(new Set([user.email.trim(), normalizeEmail(user.email)])).filter(Boolean);
  for (const email of candidateEmails) {
    const byEmail = await db.collection("staffUsers").where("email", "==", email).where("isActive", "==", true).limit(1).get();
    if (!byEmail.empty) {
      const doc = byEmail.docs[0];
      const staffUser = { id: doc.id, ...doc.data() } as StaffUser;
      if (staffUser.uid === user.uid) return staffUser;
    }
  }

  return null;
}

export async function requireStaffRequest(request: NextRequest, allowedRoles: UserRole[] = STAFF_ROLES): Promise<VerifiedStaffRequest | NextResponse> {
  const idToken = getBearerToken(request);
  if (!idToken) return authError("Sua sessão expirou. Faça login novamente.");

  try {
    const auth = getFirebaseAdminAuth() as { verifyIdToken: (token: string) => Promise<{ uid: string; email?: string | null }> };
    const decoded = await auth.verifyIdToken(idToken);
    const db = getFirebaseAdminFirestore() as any;
    const staffUser = await findActiveStaffUser(db, { uid: decoded.uid, email: decoded.email ?? null });

    if (!staffUser) return authError("Usuário sem cadastro ativo na equipe.", 403);
    if (!allowedRoles.includes(staffUser.role)) return authError("Você não possui permissão para abrir atendimentos.", 403);

    return { uid: decoded.uid, email: decoded.email ?? null, staffUser };
  } catch (error) {
    if (process.env.NODE_ENV === "development") console.error("Admin auth validation failed", error);
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Missing Firebase admin environment variables")) {
      return authError("Erro de configuração do servidor. Verifique as variáveis do Firebase Admin.", 500);
    }
    return authError("Sua sessão expirou. Faça login novamente.");
  }
}
