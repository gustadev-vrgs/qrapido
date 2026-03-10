"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function useAuthGuard(): void {
  const router = useRouter();

  useEffect(() => {
    const hasSession = typeof window !== "undefined" && window.localStorage.getItem("qrapido_staff_session") === "ok";
    if (!hasSession) {
      router.replace("/login");
    }
  }, [router]);
}
