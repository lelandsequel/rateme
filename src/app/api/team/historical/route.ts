// GET /api/team/historical
//
// Auth: SALES_MANAGER or RATER_MANAGER only.
//
// Returns:
//   monthly: 12 monthly buckets (oldest → newest) of team-wide
//            avg overall + rating count.
//   memberDeltas: per-team-member current-vs-prior-month deltas (used for
//                 the "Team Snapshot" arrows on mobile).

import { ManagerType, Role } from "@prisma/client";

import { handle } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  monthlyTeamAggregates,
  memberMonthlyDeltas,
} from "@/lib/manager-historical";

export async function GET() {
  return handle(async () => {
    const session = await requireRole(Role.SALES_MANAGER, Role.RATER_MANAGER);

    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { managerProfile: { select: { managesType: true } } },
    });
    if (!me?.managerProfile) {
      return Response.json({ error: "Manager profile not set" }, { status: 400 });
    }

    const memberships = await prisma.teamMembership.findMany({
      where: {
        managerId: session.user.id,
        acceptedAt: { not: null },
        endedAt: null,
      },
      select: {
        memberId: true,
        member: { select: { id: true, name: true } },
      },
    });
    const memberIds = memberships.map((m) => m.memberId);
    const members = memberships.map((m) => ({
      id: m.member.id,
      name: m.member.name,
    }));

    if (memberIds.length === 0) {
      return {
        monthly: monthlyTeamAggregates([]),
        memberDeltas: [],
      };
    }

    // 13-month window so the prior-month delta has data to compare against.
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - 13);
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);

    const isRepManager = me.managerProfile.managesType === ManagerType.REP_MANAGER;

    const ratings = await prisma.rating.findMany({
      where: isRepManager
        ? { repUserId: { in: memberIds }, createdAt: { gte: since } }
        : { raterUserId: { in: memberIds }, createdAt: { gte: since } },
      select: {
        responsiveness: true,
        productKnowledge: true,
        followThrough: true,
        listeningNeedsFit: true,
        trustIntegrity: true,
        createdAt: true,
        repUserId: true,
        raterUserId: true,
      },
    });

    const monthly = monthlyTeamAggregates(ratings, 12);
    const ratingsWithMemberId = ratings.map((r) => ({
      ...r,
      memberId: isRepManager ? r.repUserId : r.raterUserId,
    }));
    const memberDeltas = memberMonthlyDeltas(ratingsWithMemberId, members);

    return { monthly, memberDeltas };
  });
}
