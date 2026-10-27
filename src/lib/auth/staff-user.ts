import { doc, getDoc } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";

import { COLLECTION_NAMES, type StaffUser } from "@/lib/types/domain";
import { canAccessDashboard } from "@/lib/auth/roles";

async function getActiveStaffUserByDocId(db: Firestore, uid: string): Promise<StaffUser | null> {
  const snapshot = await getDoc(doc(db, COLLECTION_NAMES.staffUsers, uid));

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data() as Omit<StaffUser, "id">;

  if (!data.isActive || data.uid !== uid) {
    return null;
  }

  return {
    id: snapshot.id,
    ...data
  };
}

export async function getActiveStaffUser(db: Firestore, user: { uid: string; email: string | null }): Promise<StaffUser | null> {
  return getActiveStaffUserByDocId(db, user.uid);
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
    return "Login correto, mas este usuário não tem cadastro ativo na equipe (coleção staffUsers, documento com o mesmo UID do usuário). Rode \"npm run seed:staff-admin\" ou crie o documento no console do Firebase.";
  }

  return "Seu usuário existe, mas não possui permissão para acessar o painel.";
}
