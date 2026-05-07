// GET /api/team/stats — manager dashboard aggregate.
//
// SALES_MANAGER  → ratings RECEIVED by my reps in the last 90 days.
// RATER_MANAGER  → ratings GIVEN by my raters in the last 90 days.
//
// All heavy lifting is done by pure helpers in @/lib/manager-stats. This
// route just hydrates rows and shapes the response.

import { Prisma, Role } from "@prisma/client";

import { handle } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicRater } from "@/lib/redact";
import {
  totalFeedbackMoM,
  avgScoreMoM,
  teamDimensionAverages,
  resolutionRate,
  weeklyTrendSeries,
  repInteractionFrequency,
} from "@/lib/manager-stats";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export async function GET() {
  return handle(async () => {
    const session = await requireRole(Role.SALES_MANAGER, Role.RATER_MANAGER);
    const managerId = session.user.id;
    const isSalesManager = session.user.role === Role.SALES_MANAGER;

    const memberships = await prisma.teamMembership.findMany({
      where: { managerId, endedAt: null, acceptedAt: { not: null } },
      select: { memberId: true },
    });
    const memberIds = memberships.map((m) => m.memberId);

    const now = new Date();
    const since = new Date(now.getTime() - NINETY_DAYS_MS);

    if (memberIds.length === 0) {
      return emptyResponse();
    }

    const where: Prisma.RatingWhereInput = isSalesManager
      ? { repUserId: { in: memberIds }, createdAt: { gte: since } }
      : { raterUserId: { in: memberIds }, createdAt: { gte: since } };

    const ratings = await prisma.rating.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        rep: {
          include: {
            repProfile: {
              include: { industry: { select: { slug: true, name: true } } },
            },
          },
        },
        rater: {
          include: {
            raterProfile: {
              include: { industry: { select: { slug: true, name: true } } },
            },
          },
        },
      },
    });

    const dims = ratings.map((r) => ({
      createdAt: r.createdAt,
      responsiveness: r.responsiveness,
      productKnowledge: r.productKnowledge,
      followThrough: r.followThrough,
      listeningNeedsFit: r.listeningNeedsFit,
      trustIntegrity: r.trustIntegrity,
    }));

    const pairs = ratings.map((r, i) => ({
      ...dims[i],
      repUserId: r.repUserId,
      raterUserId: r.raterUserId,
    }));

    const repFreqRows = ratings.map((r) => ({
      repUserId: r.repUserId,
      createdAt: r.createdAt,
    }));

    const recentFeedback = ratings.slice(0, 10).map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      responsiveness: r.responsiveness,
      productKnowledge: r.productKnowledge,
      followThrough: r.followThrough,
      listeningNeedsFit: r.listeningNeedsFit,
      trustIntegrity: r.trustIntegrity,
      takeCallAgain: r.takeCallAgain,
      rep: r.rep.repProfile
        ? {
            id: r.rep.id,
            name: r.rep.name,
            title: r.rep.repProfile.title,
            company: r.rep.repProfile.company,
            industry: r.rep.repProfile.industry,
          }
        : { id: r.rep.id, name: r.rep.name, title: "", company: "", industry: null },
      rater: r.rater.raterProfile
        ? publicRater({
            userId: r.rater.id,
            user: r.rater,
            title: r.rater.raterProfile.title,
            company: r.rater.raterProfile.company,
            industry: r.rater.raterProfile.industry,
          })
        : null,
    }));

    return {
      role: session.user.role,
      teamSize: memberIds.length,
      windowDays: 90,
      totalFeedback: totalFeedbackMoM(ratings, now),
      avgScore: avgScoreMoM(dims, now),
      teamDimensions: teamDimensionAverages(dims, now),
      resolutionRate: resolutionRate(pairs),
      weeklyTrend: weeklyTrendSeries(dims, now),
      repFrequency: repInteractionFrequency(repFreqRows, now),
      recentFeedback,
    };
  });
}

function emptyResponse() {
  const now = new Date();
  return {
    role: null,
    teamSize: 0,
    windowDays: 90,
    totalFeedback: { thisMonth: 0, lastMonth: 0, deltaPct: null },
    avgScore: { thisMonth: 0, lastMonth: 0, deltaPct: null },
    teamDimensions: null,
    resolutionRate: { atRiskPairs: 0, resolvedPairs: 0, rate: null },
    weeklyTrend: weeklyTrendSeries([], now),
    repFrequency: {},
    recentFeedback: [],
  };
}
