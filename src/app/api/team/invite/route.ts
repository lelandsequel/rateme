// POST /api/team/invite — manager invites members by email.
//
// Body: { memberEmails: string[] } — 1..50 entries.
//
// Authorization:
//   SALES_MANAGER may only invite REPs.
//   RATER_MANAGER may only invite RATERs.
// Anyone else → 403.
//
// For each email we either create a TeamMembership (invitedAt=now,
// acceptedAt=null) or skip with a reason. Duplicates: skip if there is
// already a TeamMembership for (managerId, memberId) with endedAt=null.
//
// Response: { created: [{memberId, email}], skipped: [{email, reason}] }.

import { Role } from "@prisma/client";

import { handle } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_EMAILS = 50;

interface InviteBody {
  memberEmails?: unknown;
}

export async function POST(req: Request) {
  return handle(async () => {
    const session = await requireRole(Role.SALES_MANAGER, Role.RATER_MANAGER);
    const managerId = session.user.id;
    const allowedTargetRole =
      session.user.role === Role.SALES_MANAGER ? Role.REP : Role.RATER;

    let body: InviteBody;
    try {
      body = (await req.json()) as InviteBody;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!Array.isArray(body.memberEmails)) {
      return Response.json(
        { error: "memberEmails must be an array of strings" },
        { status: 400 },
      );
    }

    // Normalize + de-dup emails. Reject empty / oversize after dedupe.
    const seen = new Set<string>();
    const emails: string[] = [];
    for (const raw of body.memberEmails) {
      if (typeof raw !== "string") {
        return Response.json(
          { error: "memberEmails must contain only strings" },
          { status: 400 },
        );
      }
      const normalized = raw.trim().toLowerCase();
      if (!normalized) continue;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      emails.push(normalized);
    }

    if (emails.length === 0) {
      return Response.json(
        { error: "memberEmails must contain at least one email" },
        { status: 400 },
      );
    }
    if (emails.length > MAX_EMAILS) {
      return Response.json(
        { error: `memberEmails exceeds max of ${MAX_EMAILS}` },
        { status: 400 },
      );
    }

    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true, email: true, role: true },
    });
    const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));

    const targetIds = users
      .filter((u) => u.role === allowedTargetRole)
      .map((u) => u.id);
    const existing = targetIds.length
      ? await prisma.teamMembership.findMany({
          where: {
            managerId,
            memberId: { in: targetIds },
            endedAt: null,
          },
          select: { memberId: true },
        })
      : [];
    const existingMemberIds = new Set(existing.map((e) => e.memberId));

    // Member is @unique on TeamMembership, so only one (active or ended)
    // row per member can exist at a time. We need to also catch the case
    // where a member is already on ANOTHER manager's team (active).
    const otherActive = targetIds.length
      ? await prisma.teamMembership.findMany({
          where: {
            memberId: { in: targetIds },
            endedAt: null,
            NOT: { managerId },
          },
          select: { memberId: true },
        })
      : [];
    const otherActiveIds = new Set(otherActive.map((e) => e.memberId));

    // memberId @unique means we can't insert a second TeamMembership row
    // for the same member even if the previous one ended. Detect this.
    const anyExisting = targetIds.length
      ? await prisma.teamMembership.findMany({
          where: { memberId: { in: targetIds } },
          select: { memberId: true, endedAt: true, managerId: true },
        })
      : [];
    const anyExistingByMember = new Map(anyExisting.map((e) => [e.memberId, e]));

    const created: Array<{ memberId: string; email: string }> = [];
    const skipped: Array<{ email: string; reason: string }> = [];

    for (const email of emails) {
      const user = userByEmail.get(email);
      if (!user) {
        skipped.push({ email, reason: "no user with that email" });
        continue;
      }
      if (user.role !== allowedTargetRole) {
        skipped.push({
          email,
          reason: `role ${user.role} cannot be invited by ${session.user.role}`,
        });
        continue;
      }
      if (existingMemberIds.has(user.id)) {
        skipped.push({ email, reason: "already on your team" });
        continue;
      }
      if (otherActiveIds.has(user.id)) {
        skipped.push({ email, reason: "already on another manager's team" });
        continue;
      }
      const stale = anyExistingByMember.get(user.id);
      if (stale && stale.endedAt) {
        // memberId is @unique, so we have to update the existing ended row
        // back into a new pending invite rather than insert.
        await prisma.teamMembership.update({
          where: { memberId: user.id },
          data: {
            managerId,
            invitedAt: new Date(),
            acceptedAt: null,
            endedAt: null,
          },
        });
        created.push({ memberId: user.id, email });
        continue;
      }

      await prisma.teamMembership.create({
        data: {
          managerId,
          memberId: user.id,
        },
      });
      created.push({ memberId: user.id, email });
    }

    return { created, skipped };
  });
}
