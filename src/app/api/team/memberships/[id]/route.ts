// PATCH /api/team/memberships/:id — member responds to a manager invite.
//
// Body: { action: "accept" | "decline" | "leave" }
//
// Authorization: only the membership's member may PATCH (memberId ===
// session.user.id). Anyone else → 403.
//
// State transitions:
//   accept  — only if acceptedAt null AND endedAt null. Sets acceptedAt=now.
//   decline — only if acceptedAt null. Sets endedAt=now.
//   leave   — only if acceptedAt set AND endedAt null. Sets endedAt=now.

import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface PatchBody {
  action?: unknown;
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const session = await requireSession();
    const { id } = await ctx.params;

    let body: PatchBody;
    try {
      body = (await req.json()) as PatchBody;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const action = typeof body.action === "string" ? body.action : null;
    if (action !== "accept" && action !== "decline" && action !== "leave") {
      return Response.json(
        { error: "action must be one of: accept, decline, leave" },
        { status: 400 },
      );
    }

    const membership = await prisma.teamMembership.findUnique({ where: { id } });
    if (!membership) {
      return Response.json({ error: "Membership not found" }, { status: 404 });
    }
    if (membership.memberId !== session.user.id) {
      return Response.json(
        { error: "Only the member can act on this membership" },
        { status: 403 },
      );
    }

    const now = new Date();

    if (action === "accept") {
      if (membership.acceptedAt || membership.endedAt) {
        return Response.json(
          { error: "Cannot accept a membership that is not pending" },
          { status: 409 },
        );
      }
      const updated = await prisma.teamMembership.update({
        where: { id },
        data: { acceptedAt: now },
      });
      return { membership: updated };
    }

    if (action === "decline") {
      if (membership.acceptedAt) {
        return Response.json(
          { error: "Cannot decline a membership you've already accepted (use leave)" },
          { status: 409 },
        );
      }
      if (membership.endedAt) {
        return Response.json(
          { error: "Membership already ended" },
          { status: 409 },
        );
      }
      const updated = await prisma.teamMembership.update({
        where: { id },
        data: { endedAt: now },
      });
      return { membership: updated };
    }

    // leave
    if (!membership.acceptedAt) {
      return Response.json(
        { error: "Cannot leave a membership that hasn't been accepted" },
        { status: 409 },
      );
    }
    if (membership.endedAt) {
      return Response.json(
        { error: "Membership already ended" },
        { status: 409 },
      );
    }
    const updated = await prisma.teamMembership.update({
      where: { id },
      data: { endedAt: now },
    });
    return { membership: updated };
  });
}
