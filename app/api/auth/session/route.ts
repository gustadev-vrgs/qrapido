import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getFirebaseServerEnv } from "@/lib/firebase/env";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

export async function POST(request: Request): Promise<NextResponse> {
  const payload: unknown = await request.json();
  const idToken = typeof payload === "object" && payload && "idToken" in payload ? (payload as { idToken?: unknown }).idToken : null;

  if (typeof idToken !== "string" || idToken.length < 10) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const { STAFF_SESSION_COOKIE_NAME } = getFirebaseServerEnv();

  cookies().set(STAFF_SESSION_COOKIE_NAME, idToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(): Promise<NextResponse> {
  const { STAFF_SESSION_COOKIE_NAME } = getFirebaseServerEnv();
  cookies().delete(STAFF_SESSION_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
