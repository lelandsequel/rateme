// POST /api/auth/verify-email — public.
//
// Body: { token }. Consumes an `email-verify` token. On success sets
// User.emailVerifiedAt = now() so the (opt-in) login gate stops blocking
// the account.
//
// As with reset-password, errors are intentionally generic.

import { handle } from "@/lib/api";
import { consumeAuthToken } from "@/lib/auth-tokens";
import { HAS_DB } from "@/lib/env";
import { prisma } from "@/lib/prisma";

interface Body {
  token?: unknown;
}

const GENERIC = "Invalid or expired verification token";

export async function POST(req: Request) {
  return handle(async () => {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const token = typeof body.token === "string" ? body.token : null;
    if (!token) return Response.json({ error: GENERIC }, { status: 400 });

    if (!HAS_DB) {
      return Response.json(
        { error: "Database is not configured" },
        { status: 503 },
      );
    }

    const consumed = await consumeAuthToken(token, "email-verify");
    if (!consumed) {
      return Response.json({ error: GENERIC }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: consumed.userId },
      data: { emailVerifiedAt: new Date() },
    });

    return Response.json({ ok: true });
  });
}
