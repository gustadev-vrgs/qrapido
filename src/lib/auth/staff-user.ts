import { doc, getDoc } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";

import { COLLECTION_NAMES, type StaffUser } from "@/lib/types/domain";
import { canAccessDashboard } from "@/lib/auth/roles";

type Lookup = { staffUser: StaffUser } | { error: "missing_staff_user" | "inactive_staff_user" };

async function lookupStaffUser(db: Firestore, uid: string): Promise<Lookup> {
  const snapshot = await getDoc(doc(db, COLLECTION_NAMES.staffUsers, uid));
  if (!snapshot.exists()) return { error: "missing_staff_user" };
  const data = snapshot.data() as Omit<StaffUser, "id">;
  // Older records may miss the uid field; the document id is the source of truth.
  if (data.uid && data.uid !== uid) return { error: "missing_staff_user" };
  if (!data.isActive) return { error: "inactive_staff_user" };
  return { staffUser: { id: snapshot.id, ...data, uid } };
}

export async function getActiveStaffUser(db: Firestore, user: { uid: string; email: string | null }): Promise<StaffUser | null> {
  const found = await lookupStaffUser(db, user.uid);
  return "staffUser" in found ? found.staffUser : null;
}

export type StaffValidationError = "missing_staff_user" | "inactive_staff_user" | "forbidden_role";

export interface StaffValidationResult {
  staffUser: StaffUser | null;
  error: StaffValidationError | null;
}

export async function validateAdminStaffUser(db: Firestore, user: { uid: string; email: string | null }): Promise<StaffValidationResult> {
  const found = await lookupStaffUser(db, user.uid);
  if (!("staffUser" in found)) return { staffUser: null, error: found.error };
  const staffUser = found.staffUser;

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

export function getStaffValidationMessage(error: StaffValidationError, uid?: string): string {
  if (error === "missing_staff_user") {
    return `E-mail e senha corretos, mas você ainda não está na equipe deste restaurante. Peça ao administrador para cadastrar você em Equipe.${uid ? ` (Código do usuário para o suporte: ${uid})` : ""}`;
  }
  if (error === "inactive_staff_user") {
    return "Seu acesso foi desativado pelo administrador do restaurante. Fale com ele para voltar a entrar.";
  }

  return "Seu usuário existe, mas não possui permissão para acessar o painel.";
}
