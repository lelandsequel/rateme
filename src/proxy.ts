// Next.js 16 renamed `middleware.ts` to `proxy.ts`.
// See: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
//
// Auth model: we DON'T enforce auth in the proxy (Edge runtime) anymore.
// Calling auth() in Edge against an Auth.js v5 jwt-strategy session was
// unreliable post-pivot (browser had the __Secure-authjs.session-token
// cookie, the layout's auth() in the Node runtime saw it, but the Edge
// auth() did not — bouncing users back to /login on every navigation
// despite a valid session).
//
// Instead:
//   • API routes — each calls requireSession() which understands cookies
//                  (web) AND Authorization: Bearer JWTs (mobile).
//   • Pages — (authed)/layout.tsx calls auth() in Node and redirects if
//             unauthenticated. Public pages render without any check.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  // Run on every path except Next.js static assets and image optimization.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$|.*\\.jpg$).*)",
  ],
};
