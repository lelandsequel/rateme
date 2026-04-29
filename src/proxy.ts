// Next.js 16 renamed `middleware.ts` to `proxy.ts`.
// See: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
//
// We protect every page except /login, /api/auth/*, and Next.js internals.
// Unauth'd traffic is redirected to /login with `?callbackUrl=` preserved.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { HAS_DB } from "@/lib/env";

const PUBLIC_PREFIXES = ["/login", "/api/auth"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/") || pathname === p,
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Mock mode (no DATABASE_URL): skip auth entirely so demos boot without
  // provisioning. The login page still works for testing the auth flow.
  if (!HAS_DB) {
    return NextResponse.next();
  }

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const session = await auth();
  if (session?.user) {
    return NextResponse.next();
  }

  // For API routes, return 401 JSON instead of redirecting.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
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
