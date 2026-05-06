// POST /api/mobile/login — token-based login for mobile clients.
//
// Why this exists separately from /api/auth/callback/credentials:
//   Auth.js v5 issues session tokens via __Secure-/__Host- cookies on a 302
//   redirect response. iOS NSURLSession's cookie storage handles those
//   inconsistently from native fetch — sessions silently fail to persist.
//   Returning a JWT in the response body sidesteps cookies entirely.
//
// Body:    { email, password }
// Returns: { token, user } on success, 401 on bad credentials.

import bcrypt from "bcrypt";

import { handle } from "@/lib/api";
import { HAS_DB } from "@/lib/env";
import { signMobileToken } from "@/lib/mobile-token";
import { prisma } from "@/lib/prisma";

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

export async function POST(req: Request) {
  return handle(async () => {
    let body: LoginBody;
    try {
      body = (await req.json()) as LoginBody;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const email = typeof body.email === "string" ? body.email.trim() : null;
    const password = typeof body.password === "string" ? body.password : null;
    if (!email || !password) {
      return Response.json(
        { error: "email and password required" },
        { status: 400 },
      );
    }

    let resolved: {
      id: string;
      email: string;
      name: string;
      role: string;
    } | null = null;

    if (!HAS_DB) {
      // Mock-mode fallback for offline demos.
      if (email === "tj@ratemyrep.com" && password === "demo123") {
        resolved = {
          id: "mock-user-1",
          email: "tj@ratemyrep.com",
          name: "TJ",
          role: "SALES_MANAGER",
        };
      }
    } else {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user?.passwordHash && (await bcrypt.compare(password, user.passwordHash))) {
        resolved = {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          });
        } catch {
          // ignore
        }
      }
    }

    if (!resolved) {
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = await signMobileToken({
      sub: resolved.id,
      email: resolved.email,
      name: resolved.name,
      role: resolved.role,
    });

    return Response.json({
      token,
      user: {
        id: resolved.id,
        email: resolved.email,
        name: resolved.name,
        role: resolved.role,
      },
    });
  });
}
