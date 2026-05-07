// Rankings — where a user lands inside a cohort.
//
// Per spec:
//   REPs   — ranked vs teammates AND vs same-industry-same-state reps,
//            metric = overall score (mean of 5 dim averages) over the
//            last 365 days of ratings received.
//   RATERS — ranked vs same-industry-same-state raters,
//            metric = ratings given in the last 365 days.
//            Plus a fulfillment % = COMPLETED / (COMPLETED + PENDING)
//            on RatingRequests addressed to them.
//
// Tie handling: standard competition ranking (1, 2, 2, 4 ...). Percentile
// is `(total - rank + 1) / total * 100`, so rank 1 of 4 = 100, rank 4 of
// 4 = 25.

import type { PrismaClient } from "@prisma/client";
import { Role, RatingRequestStatus } from "@prisma/client";

export interface Ranking {
  rank: number;
  total: number;
  percentile: number;
  metric: number;
  metricLabel: string;
}

export interface CohortEntry {
  userId: string;
  metric: number;
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export function computeRanking(
  userId: string,
  cohort: ReadonlyArray<CohortEntry>,
  metricLabel: string,
): Ranking | null {
  if (cohort.length === 0) return null;

  const sorted = [...cohort].sort((a, b) => b.metric - a.metric);
  const total = sorted.length;

  // Competition ranking — entries with the same metric share the lowest rank.
  let rank = 0;
  let prevMetric: number | null = null;
  let me: { rank: number; metric: number } | null = null;
  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    if (prevMetric === null || entry.metric !== prevMetric) {
      rank = i + 1;
      prevMetric = entry.metric;
    }
    if (entry.userId === userId) {
      me = { rank, metric: entry.metric };
      break;
    }
  }
  if (!me) return null;

  const percentile = Math.round(((total - me.rank + 1) / total) * 100);
  return { rank: me.rank, total, percentile, metric: me.metric, metricLabel };
}

// ---------------------------------------------------------------------------
// Prisma-bound convenience computations
// ---------------------------------------------------------------------------

interface DimRating {
  responsiveness: number;
  productKnowledge: number;
  followThrough: number;
  listeningNeedsFit: number;
  trustIntegrity: number;
}

function overallFromRatings(ratings: ReadonlyArray<DimRating>): number {
  if (ratings.length === 0) return 0;
  let sum = 0;
  for (const r of ratings) {
    sum +=
      (r.responsiveness +
        r.productKnowledge +
        r.followThrough +
        r.listeningNeedsFit +
        r.trustIntegrity) /
      5;
  }
  return Math.round((sum / ratings.length) * 10) / 10;
}

export async function repTeamRanking(
  prisma: PrismaClient,
  repUserId: string,
): Promise<Ranking | null> {
  const since = new Date(Date.now() - YEAR_MS);

  const myMembership = await prisma.teamMembership.findUnique({
    where: { memberId: repUserId },
  });
  if (!myMembership || myMembership.endedAt) return null;

  const teamMemberships = await prisma.teamMembership.findMany({
    where: { managerId: myMembership.managerId, endedAt: null },
    include: {
      member: {
        select: {
          id: true,
          role: true,
          ratingsReceived: {
            where: { createdAt: { gte: since } },
            select: {
              responsiveness: true,
              productKnowledge: true,
              followThrough: true,
              listeningNeedsFit: true,
              trustIntegrity: true,
            },
          },
        },
      },
    },
  });

  const cohort: CohortEntry[] = teamMemberships
    .filter((m) => m.member.role === Role.REP)
    .map((m) => ({
      userId: m.member.id,
      metric: overallFromRatings(m.member.ratingsReceived),
    }));

  return computeRanking(repUserId, cohort, "overall score");
}

export async function repIndustryRegionalRanking(
  prisma: PrismaClient,
  repUserId: string,
): Promise<Ranking | null> {
  const since = new Date(Date.now() - YEAR_MS);

  const me = await prisma.user.findUnique({
    where: { id: repUserId },
    select: {
      state: true,
      role: true,
      repProfile: { select: { industryId: true } },
    },
  });
  if (!me || me.role !== Role.REP || !me.repProfile) return null;

  const peers = await prisma.user.findMany({
    where: {
      role: Role.REP,
      state: me.state,
      repProfile: { industryId: me.repProfile.industryId },
    },
    select: {
      id: true,
      ratingsReceived: {
        where: { createdAt: { gte: since } },
        select: {
          responsiveness: true,
          productKnowledge: true,
          followThrough: true,
          listeningNeedsFit: true,
          trustIntegrity: true,
        },
      },
    },
  });

  const cohort: CohortEntry[] = peers.map((p) => ({
    userId: p.id,
    metric: overallFromRatings(p.ratingsReceived),
  }));

  return computeRanking(repUserId, cohort, "overall score");
}

export async function raterIndustryRegionalRanking(
  prisma: PrismaClient,
  raterUserId: string,
): Promise<Ranking | null> {
  const since = new Date(Date.now() - YEAR_MS);

  const me = await prisma.user.findUnique({
    where: { id: raterUserId },
    select: {
      state: true,
      role: true,
      raterProfile: { select: { industryId: true } },
    },
  });
  if (!me || me.role !== Role.RATER || !me.raterProfile) return null;

  const peers = await prisma.user.findMany({
    where: {
      role: Role.RATER,
      state: me.state,
      raterProfile: { industryId: me.raterProfile.industryId },
    },
    select: {
      id: true,
      _count: {
        select: {
          ratingsGiven: { where: { createdAt: { gte: since } } },
        },
      },
    },
  });

  const cohort: CohortEntry[] = peers.map((p) => ({
    userId: p.id,
    metric: p._count.ratingsGiven,
  }));

  return computeRanking(raterUserId, cohort, "ratings given (year)");
}

export async function raterFulfillmentRate(
  prisma: PrismaClient,
  raterUserId: string,
): Promise<{ fulfillmentPct: number | null; completed: number; pending: number }> {
  const requests = await prisma.ratingRequest.groupBy({
    by: ["status"],
    where: {
      toRaterUserId: raterUserId,
      status: { in: [RatingRequestStatus.COMPLETED, RatingRequestStatus.PENDING] },
    },
    _count: { _all: true },
  });

  let completed = 0;
  let pending = 0;
  for (const row of requests) {
    if (row.status === RatingRequestStatus.COMPLETED) completed = row._count._all;
    else if (row.status === RatingRequestStatus.PENDING) pending = row._count._all;
  }
  const total = completed + pending;
  const fulfillmentPct = total === 0 ? null : Math.round((completed / total) * 100);
  return { fulfillmentPct, completed, pending };
}
