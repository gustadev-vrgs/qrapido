"use client";

import { useAuth } from "@/components/providers/auth-provider";

export function useAdminAuth() {
  return useAuth();
}
