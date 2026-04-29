import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import "next-auth/jwt";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { HAS_DB } from "@/lib/env";

// ---------------------------------------------------------------------------
// Module augmentation: tenant + role on the session and JWT.
// ---------------------------------------------------------------------------

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      tenantId: string;
      role: string;
    } & DefaultSession["user"];
  }
  interface User {
    id?: string;
    tenantId?: string;
    role?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    tenantId?: string;
    role?: string;
  }
}

// ---------------------------------------------------------------------------
// NextAuth config (Auth.js v5)
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

        // Mock-mode demo login: when no DB, accept the seed admin so demos can
        // exercise the protected app surface without provisioning.
        if (!HAS_DB) {
          if (email === "admin@demo.com" && password === "demo123") {
            return {
              id: "mock-user-1",
              email: "admin@demo.com",
              name: "Demo Admin",
              tenantId: "tenant-demo",
              role: "ADMIN",
            };
          }
          return null;
        }

        const user = await prisma.uSER.findFirst({
          where: { email },
        });
        if (!user || !user.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        // Touch lastLoginAt — best-effort, swallow errors.
        try {
          await prisma.uSER.update({
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
          tenantId: user.tenantId,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = (user as { id?: string }).id ?? token.userId;
        token.tenantId = (user as { tenantId?: string }).tenantId ?? token.tenantId;
        token.role = (user as { role?: string }).role ?? token.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = (token.userId as string) ?? "";
        session.user.tenantId = (token.tenantId as string) ?? "";
        session.user.role = (token.role as string) ?? "MEMBER";
      }
      return session;
    },
  },
});

// ---------------------------------------------------------------------------
// Helper utilities for API routes
// ---------------------------------------------------------------------------

/**
 * Returns the current session, throwing a 401 Response if there is none.
 * Always use inside API route handlers.
 */
export async function requireSession() {
  const session = await auth();
  if (!session?.user) {
    throw new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  return session;
}

/**
 * Returns the current user's tenantId, throwing 401/403 as appropriate.
 * If `requestedTenantId` is supplied and differs from the session tenant,
 * throws a 403 to block cross-tenant data access.
 */
export async function requireTenant(requestedTenantId?: string): Promise<string> {
  const session = await requireSession();
  const tenantId = session.user.tenantId;
  if (!tenantId) {
    throw new Response(
      JSON.stringify({ error: "Forbidden — no tenant" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  if (requestedTenantId && requestedTenantId !== tenantId) {
    throw new Response(
      JSON.stringify({ error: "Forbidden — cross-tenant" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  return tenantId;
}
