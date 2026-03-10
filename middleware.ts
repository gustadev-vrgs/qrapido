import { NextResponse, type NextRequest } from "next/server";
import { getFirebaseServerEnv } from "@/lib/firebase/env";

const ADMIN_PREFIX = "/admin";

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith(ADMIN_PREFIX)) {
    return NextResponse.next();
  }

  const { STAFF_SESSION_COOKIE_NAME } = getFirebaseServerEnv();
  const sessionCookie = request.cookies.get(STAFF_SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"]
};
