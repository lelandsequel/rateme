/**
 * Score persistence + recompute helpers.
 *
 * Wraps the pure QUASAR engine with Prisma reads/writes. Both functions
 * are no-ops in mock mode (HAS_DB=false) and return null/0 so callers
 * don't need extra branches.
 */

import { prisma } from "./prisma";
import { HAS_DB } from "./env";
import { aggregateRepSignals, scoreRep } from "./quasar";

const MS_PER_DAY = 86_400_000;

/**
 * Recompute and persist a single rep's score.
 * Returns the new REP_SCORE row, or null if mock mode / rep not found.
 */
export async function recomputeRepScore(
  repId: string,
  tenantId: string,
  now: Date = new Date(),
) {
  if (!HAS_DB) return null;

  const rep = await prisma.rEP.findFirst({
    where: { id: repId, tenantId },
  });
  if (!rep) return null;

  // Pull last 30 days of sessions for this rep (covers both windows).
  const thirtyDaysAgo = new Date(now.getTime() - 30 * MS_PER_DAY);
  const sessions = await prisma.sESSION.findMany({
    where: {
      repId: rep.id,
      tenantId,
      startedAt: { gte: thirtyDaysAgo },
    },
  });

  // No deal-activity table yet — pass empty array. Schema gap noted in spec.
  const signals = aggregateRepSignals(
    {
      hireDate: rep.hireDate,
    },
    sessions.map((s) => ({
      startedAt: s.startedAt,
      sentiment: s.sentiment,
      type: s.type,
    })),
    [],
    now,
  );

  const result = scoreRep(signals);

  const row = await prisma.rEP_SCORE.create({
    data: {
      score: result.score,
      confidence: result.confidence,
      dimension: "overall",
      period: result.band,
      calculatedAt: now,
      repId: rep.id,
    },
  });

  return { row, result };
}

/**
 * Recompute scores for every active rep in a tenant.
 * Returns the count of reps successfully scored.
 */
export async function recomputeTenantScores(tenantId: string): Promise<number> {
  if (!HAS_DB) return 0;

  const reps = await prisma.rEP.findMany({
    where: { tenantId, status: "ACTIVE" },
    select: { id: true },
  });

  let count = 0;
  const now = new Date();
  for (const r of reps) {
    const out = await recomputeRepScore(r.id, tenantId, now);
    if (out) count++;
  }
  return count;
}
