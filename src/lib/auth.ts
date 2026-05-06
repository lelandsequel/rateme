import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import "next-auth/jwt";
import bcrypt from "bcrypt";
import { headers } from "next/headers";

import { prisma } from "@/lib/prisma";
import { HAS_DB } from "@/lib/env";
import { verifyMobileToken } from "@/lib/mobile-token";

// ---------------------------------------------------------------------------
// Module augmentation: role on the session and JWT.
//
// Note: RMR has no tenant concept — users own their own data. The `role`
// field (REP | RATER | SALES_MANAGER | RATER_MANAGER | ADMIN) drives
// authorization throughout the app.
// ---------------------------------------------------------------------------

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession["user"];
  }
  interface User {
    id?: string;
    role?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: string;
  }
}

// ---------------------------------------------------------------------------
// NextAuth config (Auth.js v5) — primarily used by the web client.
// ---------------------------------------------------------------------------

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string" ? credentials.email : null;
        const password =
          typeof credentials?.password === "string" ? credentials.password : null;
        if (!email || !password) return null;

        if (!HAS_DB) {
          // Mock-mode demo login — single-shot fallback for offline demos.
          if (email === "tj@ratemyrep.com" && password === "demo123") {
            return {
              id: "mock-user-1",
              email: "tj@ratemyrep.com",
              name: "TJ",
              role: "SALES_MANAGER",
            };
          }
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        // Touch lastLoginAt — best-effort, swallow errors.
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          });
        } catch {
          // ignore
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = (user as { id?: string }).id ?? token.userId;
        token.role = (user as { role?: string }).role ?? token.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = (token.userId as string) ?? "";
        session.user.role = (token.role as string) ?? "REP";
      }
      return session;
    },
  },
});

// ---------------------------------------------------------------------------
// Helper utilities for API routes
// ---------------------------------------------------------------------------

/**
 * The minimal shape every API route consumes. Both Auth.js cookie sessions
 * (web) and Bearer-token sessions (mobile) normalize to this.
 */
export interface RequiredSession {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

/**
 * Returns the current session, throwing a 401 Response if there is none.
 *
 * Two auth paths are checked in order:
 *   1. Authorization: Bearer <jwt>  — used by the mobile client (token
 *      issued via /api/mobile/login).
 *   2. Auth.js cookie session — used by the web client.
 */
export async function requireSession(): Promise<RequiredSession> {
  const h = await headers();
  const authHeader = h.get("authorization");
  if (authHeader) {
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    if (m) {
      const payload = await verifyMobileToken(m[1].trim());
      if (payload) {
        return {
          user: {
            id: payload.sub,
            email: payload.email,
            name: payload.name,
            role: payload.role,
          },
        };
      }
    }
  }

  const session = await auth();
  if (!session?.user) {
    throw new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  return {
    user: {
      id: session.user.id ?? "",
      email: session.user.email ?? "",
      name: session.user.name ?? "",
      role: session.user.role,
    },
  };
}

/**
 * Throws 403 if the current user's role isn't in the allowed list.
 */
export async function requireRole(
  ...allowed: ReadonlyArray<string>
): Promise<RequiredSession> {
  const s = await requireSession();
  if (!allowed.includes(s.user.role)) {
    throw new Response(
      JSON.stringify({ error: "Forbidden — role not allowed" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  return s;
}
