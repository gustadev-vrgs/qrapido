import { collection, getDocs, limit, query, where } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";

import { COLLECTION_NAMES, type StaffUser } from "@/lib/types/domain";
import { canAccessDashboard } from "@/lib/auth/roles";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function getActiveStaffUserByField(db: Firestore, field: "uid" | "email", value: string): Promise<StaffUser | null> {
  const staffQuery = query(
    collection(db, COLLECTION_NAMES.staffUsers),
    where(field, "==", value),
    where("isActive", "==", true),
    limit(1)
  );

  const snapshot = await getDocs(staffQuery);

  if (snapshot.empty) {
    return null;
  }

  const document = snapshot.docs[0];
  return {
    id: document.id,
    ...(document.data() as Omit<StaffUser, "id">)
  };
}

export async function getActiveStaffUser(db: Firestore, user: { uid: string; email: string | null }): Promise<StaffUser | null> {
  const byUid = await getActiveStaffUserByField(db, "uid", user.uid);

  if (byUid) {
    return byUid;
  }

  if (!user.email) {
    return null;
  }

  const trimmedEmail = user.email.trim();
  const normalizedEmail = normalizeEmail(user.email);
  const candidateEmails = Array.from(new Set([trimmedEmail, normalizedEmail])).filter(Boolean);

  for (const email of candidateEmails) {
    const byEmail = await getActiveStaffUserByField(db, "email", email);

    if (byEmail) {
      return byEmail;
    }
  }

  return null;
}

export type StaffValidationError = "missing_staff_user" | "forbidden_role";

export interface StaffValidationResult {
  staffUser: StaffUser | null;
  error: StaffValidationError | null;
}

export async function validateAdminStaffUser(db: Firestore, user: { uid: string; email: string | null }): Promise<StaffValidationResult> {
  const staffUser = await getActiveStaffUser(db, user);

  if (!staffUser) {
    return {
      staffUser: null,
      error: "missing_staff_user"
    };
  }

  if (!canAccessDashboard(staffUser.role)) {
    return {
      staffUser,
      error: "forbidden_role"
    };
  }

  return {
    staffUser,
    error: null
  };
}

export function getStaffValidationMessage(error: StaffValidationError): string {
  if (error === "missing_staff_user") {
    return "Usuário autenticado no Firebase, mas sem cadastro ativo em staffUsers.";
  }

  return "Seu usuário existe, mas não possui permissão para acessar o painel.";
}
