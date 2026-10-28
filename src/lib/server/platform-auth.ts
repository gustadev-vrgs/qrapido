import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { getFirebaseAdminAuth } from "@/lib/firebase/admin";

/**
 * The platform owner (who signs up restaurants) is not staff of any restaurant.
 * Allowed e-mails come from PLATFORM_ADMIN_EMAILS (comma-separated) and the e-mail
 * must be verified: otherwise anyone could create a login with that address first.
 */
export function platformAdminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter((email) => email.includes("@"));
}

export interface PlatformAdmin { uid: string; email: string }

export async function requirePlatformAdmin(request: NextRequest): Promise<PlatformAdmin | NextResponse> {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: "Faça login.", code: "invalid_token" }, { status: 401 });
  const allowed = platformAdminEmails();
  if (!allowed.length) return NextResponse.json({ error: "Área da plataforma desativada: defina PLATFORM_ADMIN_EMAILS na Vercel.", code: "platform_disabled" }, { status: 503 });
  let decoded: { uid: string; email?: string; email_verified?: boolean };
  try {
    decoded = await (getFirebaseAdminAuth() as { verifyIdToken(token: string): Promise<{ uid: string; email?: string; email_verified?: boolean }> }).verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "Sua sessão expirou. Faça login novamente.", code: "invalid_token" }, { status: 401 });
  }
  const email = decoded.email?.toLowerCase() ?? "";
  if (!allowed.includes(email)) return NextResponse.json({ error: "Este login não administra a plataforma.", code: "not_platform_admin" }, { status: 403 });
  if (decoded.email_verified !== true) return NextResponse.json({ error: "Confirme o seu e-mail antes de usar esta área.", code: "email_not_verified" }, { status: 403 });
  return { uid: decoded.uid, email };
}
