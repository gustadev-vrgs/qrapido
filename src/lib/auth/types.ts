import type { StaffUser, UserRole } from "@/lib/types/domain";

export interface AdminSessionUser {
  uid: string;
  email: string | null;
  role: UserRole;
  restaurantId: string;
  staffUserId: string;
  name: string;
}

export interface AdminAuthState {
  user: AdminSessionUser | null;
  staffUser: StaffUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  authError: string | null;
}
