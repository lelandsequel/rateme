// GET /api/managers/:id — manager profile payload.
//
// Managers are public-facing (their identity backs a Rep's profile link),
// so name + email are visible. Team-side payloads are still summarized
// (size + 90d aggregate stats) — per-rater identity stays redacted, and
// per-rep numbers live on the rep profile pages.

import { ManagerType, Role } from "@prisma/client";

import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    await requireSession();
    const { id } = await ctx.params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        managerProfile: true,
      },
    });

    const isManager =
      !!user &&
      (user.role === Role.SALES_MANAGER || user.role === Role.RATER_MANAGER) &&
      !!user.managerProfile;

    if (!isManager) {
      return Response.json({ error: "Manager not found" }, { status: 404 });
    }

    const activeMemberships = await prisma.teamMembership.findMany({
      where: {
        managerId: user.id,
        endedAt: null,
        acceptedAt: { not: null },
      },
      select: { memberId: true },
    });
    const memberIds = activeMemberships.map((m) => m.memberId);
    const teamSize = memberIds.length;

    const since = new Date(Date.now() - NINETY_DAYS_MS);
    let teamStats: { avgOverall: number | null; ratingsLast90d: number } | null = null;

    if (memberIds.length > 0) {
      if (user.managerProfile!.managesType === "REP_MANAGER") {
        const ratings = await prisma.rating.findMany({
          where: { repUserId: { in: memberIds }, createdAt: { gte: since } },
          select: { answers: { select: { score: true } } },
        });
        if (ratings.length === 0) {
          teamStats = { avgOverall: null, ratingsLast90d: 0 };
        } else {
          // Mean of (mean of all answer scores per rating).
          let sum = 0;
          let n = 0;
          for (const r of ratings) {
            if (r.answers.length === 0) continue;
            let s = 0;
            for (const a of r.answers) s += a.score;
            sum += s / r.answers.length;
            n++;
          }
          teamStats = {
            avgOverall: n === 0 ? null : Math.round((sum / n) * 10) / 10,
            ratingsLast90d: ratings.length,
          };
        }
      } else {
        const count = await prisma.rating.count({
          where: { raterUserId: { in: memberIds }, createdAt: { gte: since } },
        });
        teamStats = { avgOverall: null, ratingsLast90d: count };
      }
    } else {
      teamStats = { avgOverall: null, ratingsLast90d: 0 };
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      state: user.state,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      manager: {
        managesType: user.managerProfile!.managesType,
        company: user.managerProfile!.company,
      },
      teamSize,
      teamStats,
    } satisfies ManagerPayload;
  });
}

// Exported for the Server Component page to share the response shape without
// a redundant fetch through the network layer.
export interface ManagerPayload {
  id: string;
  name: string;
  email: string;
  role: Role;
  state: string;
  avatarUrl: string | null;
  createdAt: Date;
  manager: {
    managesType: ManagerType;
    company: string;
  };
  teamSize: number;
  teamStats: {
    avgOverall: number | null;
    ratingsLast90d: number;
  } | null;
}
