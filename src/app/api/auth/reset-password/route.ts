// POST /api/auth/reset-password — public.
//
// Body: { token, newPassword }. Validates the token (consume + expire-check),
// hashes the new password with bcrypt, and updates User.passwordHash.
//
// Errors are intentionally generic — we don't tell the caller whether the
// token was wrong, expired, or already consumed. That keeps token-hash
// guessing useless.

import bcrypt from "bcrypt";

import { handle } from "@/lib/api";
import { consumeAuthToken } from "@/lib/auth-tokens";
import { HAS_DB } from "@/lib/env";
import { prisma } from "@/lib/prisma";

interface Body {
  token?: unknown;
  newPassword?: unknown;
}

const GENERIC = "Invalid or expired reset token";

function isStrongEnoughPassword(p: string): boolean {
  return p.length >= 8;
}

export async function POST(req: Request) {
  return handle(async () => {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const token = typeof body.token === "string" ? body.token : null;
    const newPassword =
      typeof body.newPassword === "string" ? body.newPassword : null;

    if (!token) return Response.json({ error: GENERIC }, { status: 400 });
    if (!newPassword || !isStrongEnoughPassword(newPassword)) {
      return Response.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }

    if (!HAS_DB) {
      return Response.json(
        { error: "Database is not configured" },
        { status: 503 },
      );
    }

    const consumed = await consumeAuthToken(token, "password-reset");
    if (!consumed) {
      return Response.json({ error: GENERIC }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: consumed.userId },
      data: { passwordHash },
    });

    return Response.json({ ok: true });
  });
}
