// PATCH /api/admin/users/[id] — ADMIN-only mutation of user record.
//
// Body shape: { role?: Role, deactivated?: boolean }
//
// NOTE — there is no `deactivated` column on the User model in
// prisma/schema.prisma. For now we accept the field on the wire (so the
// UI doesn't break when wired up later) but only the `role` change is
// actually persisted. The response includes a `notes` field flagging
// the missing schema column. Adding a `deactivated` (or
// `deactivatedAt: DateTime?`) field is queued as a future migration.

import { Role } from "@prisma/client";

import { handle, isValidId } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_ROLES = new Set<string>(Object.values(Role));

interface PatchBody {
  role?: string;
  deactivated?: boolean;
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    await requireRole("ADMIN");

    const { id } = await ctx.params;
    if (!isValidId(id)) {
      return Response.json({ error: "Invalid user id" }, { status: 400 });
    }

    let body: PatchBody;
    try {
      body = (await req.json()) as PatchBody;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const notes: string[] = [];

    // role change — actually applied.
    let newRole: Role | undefined;
    if (typeof body.role === "string") {
      if (!VALID_ROLES.has(body.role)) {
        return Response.json({ error: "Invalid role" }, { status: 400 });
      }
      newRole = body.role as Role;
    }

    // deactivated — wire-accepted but NOT persisted (schema column missing).
    if (body.deactivated !== undefined) {
      notes.push(
        "deactivated flag ignored — User model has no `deactivated` column yet (future migration).",
      );
    }

    const updated =
      newRole !== undefined
        ? await prisma.user.update({
            where: { id },
            data: { role: newRole },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              state: true,
              createdAt: true,
              lastLoginAt: true,
              emailVerifiedAt: true,
            },
          })
        : {
            id: target.id,
            name: target.name,
            email: target.email,
            role: target.role,
            state: target.state,
            createdAt: target.createdAt,
            lastLoginAt: target.lastLoginAt,
            emailVerifiedAt: target.emailVerifiedAt,
          };

    return { user: updated, notes };
  });
}
