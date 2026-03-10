"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function useAuthGuard(): void {
  const router = useRouter();

  useEffect(() => {
    const sessionHint = window.sessionStorage.getItem("qrapido_staff_session_hint");
    if (sessionHint !== "ok") {
      router.refresh();
    }
  }, [router]);
}
