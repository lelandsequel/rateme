// POST /api/auth/request-password-reset — public.
//
// Body: { email }. Always returns 200 even if the email is unknown — this
// avoids leaking which addresses have accounts. When the user exists we
// issue a `password-reset` token and email a link to /reset-password.
//
// This route is fire-and-forget from the caller's perspective: we await
// the issue + send so any infra failures show up in logs, but we never
// surface them in the response body.

import { handle } from "@/lib/api";
import { issueAndSendReset } from "@/lib/auth-emails";
import { HAS_DB } from "@/lib/env";
import { prisma } from "@/lib/prisma";

interface Body {
  email?: unknown;
}

export async function POST(req: Request) {
  return handle(async () => {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : null;

    // Generic 200 — same shape whether or not we found a user.
    const ok = Response.json({ ok: true });

    if (!email) return ok;
    if (!HAS_DB) return ok;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true },
    });
    if (!user) return ok;

    try {
      await issueAndSendReset(user);
    } catch (err) {
      console.warn("[request-password-reset] issue/send failed:", err);
    }

    return ok;
  });
}
