import type { UserRole } from "@/lib/types/domain";

export const DASHBOARD_ALLOWED_ROLES: UserRole[] = ["admin", "manager", "attendant", "kitchen"];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  manager: "Gerente",
  attendant: "Atendente",
  kitchen: "Cozinha"
};

export function canAccessDashboard(role: UserRole): boolean {
  return DASHBOARD_ALLOWED_ROLES.includes(role);
}
