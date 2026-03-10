"use client";

import { signInWithEmailAndPassword, signOut, type UserCredential } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { loginSchema, type LoginInput } from "@/lib/schemas";

export class AuthError extends Error {}

export async function signInStaff(payload: LoginInput): Promise<UserCredential> {
  const validated = loginSchema.parse(payload);

  if (!auth) {
    throw new AuthError("Firebase não configurado. Confira variáveis NEXT_PUBLIC_FIREBASE_*.");
  }

  return signInWithEmailAndPassword(auth, validated.email, validated.password);
}

export async function persistStaffSessionCookie(idToken: string): Promise<void> {
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken })
  });

  if (!response.ok) {
    throw new AuthError("Não foi possível criar sessão administrativa.");
  }
}

export async function logoutStaff(): Promise<void> {
  if (auth) {
    await signOut(auth);
  }

  await fetch("/api/auth/session", { method: "DELETE" });
}
