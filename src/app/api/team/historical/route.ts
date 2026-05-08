// GET /api/team/historical
//
// Auth: SALES_MANAGER or RATER_MANAGER only.
//
// Returns:
//   monthly:           12 monthly buckets (oldest → newest) of team-wide
//                      avg overall + rating count.
//   memberDeltas:      per-team-member current-vs-prior-month deltas (the
//                      "Team Snapshot" arrows on mobile).
//   resolutionRate:    pair-resolution rate over team ratings (uses the
//                      shared resolutionRate helper, withinDays default 60).
//   requestsSentByRep: per-team-member count of RatingRequests targeting
//                      that rep in the last 90d (for SALES_MANAGER) — for
//                      RATER_MANAGER this becomes per-rater request counts.
//   engagement:        last-90d "did the people we asked actually rate?"
//                      coverage. requestsSent vs ratingsReceived, with an
//                      integer pct (null if requestsSent=0).

import { ManagerType, Prisma, Role } from "@prisma/client";

import { handle } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  monthlyTeamAggregates,
  memberMonthlyDeltas,
} from "@/lib/manager-historical";
import { resolutionRate } from "@/lib/manager-stats";

const DAY_MS = 24 * 60 * 60 * 1000;

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

    const isRepManager = me.managerProfile.managesType === ManagerType.REP_MANAGER;

    if (memberIds.length === 0) {
      return {
        monthly: monthlyTeamAggregates([]),
        memberDeltas: [],
        resolutionRate: { atRiskPairs: 0, resolvedPairs: 0, rate: null },
        requestsSentByRep: [],
        engagement: { requestsSent: 0, ratingsReceived: 0, pct: null },
      };
    }

    // 13-month window so the prior-month delta has data to compare against.
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - 13);
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);

    const ratingWhere: Prisma.RatingWhereInput = isRepManager
      ? { repUserId: { in: memberIds }, createdAt: { gte: since } }
      : { raterUserId: { in: memberIds }, createdAt: { gte: since } };

    const ratings = await prisma.rating.findMany({
      where: ratingWhere,
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

    // Pair-level resolution rate is independent of manager type — the helper
    // groups by (rep, rater) pair and looks for a follow-up by the same rater.
    const resolution = resolutionRate(ratings);

    // Last-90d window for activity-style aggregates.
    const last90 = new Date(Date.now() - 90 * DAY_MS);

    // requestsSentByRep — for SALES_MANAGER we count requests targeting each
    // team-member rep; for RATER_MANAGER we count requests addressed to each
    // team-member rater. The output schema is intentionally rep-shaped (the
    // mobile UI is sales-manager-first; rater-manager view will reuse it).
    const reqWhere: Prisma.RatingRequestWhereInput = isRepManager
      ? { forRepUserId: { in: memberIds }, createdAt: { gte: last90 } }
      : { toRaterUserId: { in: memberIds }, createdAt: { gte: last90 } };

    const groupedRequests = isRepManager
      ? await prisma.ratingRequest.groupBy({
          by: ["forRepUserId"],
          where: reqWhere,
          _count: { _all: true },
        })
      : await prisma.ratingRequest.groupBy({
          by: ["toRaterUserId"],
          where: reqWhere,
          _count: { _all: true },
        });

    const sentByMember = new Map<string, number>();
    for (const g of groupedRequests) {
      const key = isRepManager
        ? (g as { forRepUserId: string }).forRepUserId
        : ((g as { toRaterUserId: string | null }).toRaterUserId ?? "");
      if (!key) continue;
      sentByMember.set(key, g._count._all);
    }

    const requestsSentByRep = members.map((m) => ({
      memberId: m.id,
      name: m.name,
      sent: sentByMember.get(m.id) ?? 0,
    }));

    // Engagement: "did the people we asked actually rate?" — the ratio of
    // ratings received in the window vs. requests sent in the window. This is
    // a coverage proxy, not a per-request join (a rep may receive ratings
    // from raters who weren't explicitly asked, and that's fine — it still
    // tells the manager whether the team's ask volume is producing signal).
    const requestsSent = requestsSentByRep.reduce((a, b) => a + b.sent, 0);

    const ratingsReceivedWhere: Prisma.RatingWhereInput = isRepManager
      ? { repUserId: { in: memberIds }, createdAt: { gte: last90 } }
      : { raterUserId: { in: memberIds }, createdAt: { gte: last90 } };
    const ratingsReceived = await prisma.rating.count({
      where: ratingsReceivedWhere,
    });

    const pct =
      requestsSent === 0
        ? null
        : Math.round((ratingsReceived / requestsSent) * 100);

    return {
      monthly,
      memberDeltas,
      resolutionRate: resolution,
      requestsSentByRep,
      engagement: { requestsSent, ratingsReceived, pct },
    };
  });
}
