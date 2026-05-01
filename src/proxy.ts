// Next.js 16 renamed `middleware.ts` to `proxy.ts`.
// See: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
//
// Auth model:
//   • Pages — protect everything except /login. Unauth'd → redirect to /login.
//   • API   — DON'T enforce auth here. Each route calls requireSession(),
//             which understands BOTH Auth.js cookie sessions (web) AND
//             Authorization: Bearer JWTs (mobile). Doing the check here
//             would only see cookies and would 401 every mobile request.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { HAS_DB } from "@/lib/env";

const PUBLIC_PAGE_PREFIXES = ["/login"];

function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Mock mode (no DATABASE_URL): skip auth entirely so demos boot without
  // provisioning. The login page still works for testing the auth flow.
  if (!HAS_DB) {
    return NextResponse.next();
  }

  // Hand all API routes off to their own handlers — requireSession in each
  // route enforces auth (cookie OR Bearer). The proxy can't see Bearer.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (isPublicPage(pathname)) {
    return NextResponse.next();
  }

  const session = await auth();
  if (session?.user) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Run on every path except Next.js static assets and image optimization.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$|.*\\.jpg$).*)",
  ],
};
