/**
 * Score persistence + recompute helpers.
 *
 * Wraps the pure QUASAR engine with Prisma reads/writes. Both functions
 * are no-ops in mock mode (HAS_DB=false) and return null/0 so callers
 * don't need extra branches.
 */

import { prisma } from "./prisma";
import { HAS_DB } from "./env";
import {
  aggregateRepSignals,
  scoreRep,
  scoreSession,
  type QuasarResult,
} from "./quasar";

const MS_PER_DAY = 86_400_000;

/**
 * Pick a short, human-readable "driver" string from a QUASAR result.
 *
 * Priority order matches what most directly impacted the score:
 *   1. recency penalty,
 *   2. pipeline win-rate,
 *   3. activity volume,
 *   4. sentiment,
 *   5. fallback to band label.
 *
 * Phrasing is also gently tuned to the sign of the delta — a positive
 * delta with the "Pipeline win rate strong" reason becomes
 * "Strong close rate", a negative delta with the same reason becomes
 * "Close rate slipped".
 */
export function deriveScoreDeltaDriver(
  result: QuasarResult,
  delta: number,
): string {
  const reasons = result.reasons ?? [];
  const positive = delta >= 0;

  for (const r of reasons) {
    const lower = r.toLowerCase();

    if (lower.includes("no activity in")) {
      return positive
        ? "Re-engaged after a quiet stretch"
        : "Low activity in last week";
    }
    if (lower.includes("no sessions logged")) {
      return positive ? "First sessions logged" : "No sessions logged";
    }
    if (lower.includes("pipeline win rate strong")) {
      return positive ? "Strong close rate" : "Close rate slipped";
    }
    if (lower.includes("pipeline win rate weak")) {
      return positive ? "Win rate recovering" : "Weak win rate";
    }
    if (lower.includes("pipeline win rate moderate")) {
      return "Pipeline mixed";
    }
    if (lower.includes("high activity volume")) {
      return positive ? "High activity volume" : "Activity-driven dip";
    }
    if (lower.includes("low activity volume")) {
      return positive ? "Activity ticking up" : "Low activity yesterday";
    }
    if (lower.includes("steady activity")) {
      return "Steady activity cadence";
    }
    if (lower.includes("customer sentiment positive")) {
      return positive ? "Positive customer sentiment" : "Sentiment cooling";
    }
    if (lower.includes("customer sentiment lagging")) {
      return positive ? "Sentiment recovering" : "Customer sentiment lagging";
    }
    if (lower.includes("ramp grace")) {
      return "Ramp-grace lift";
    }
    if (lower.includes("veteran calibration")) {
      return "Veteran calibration";
    }
  }

  // Fallback — use band as a last resort.
  return `Band: ${result.band}`;
}

/**
 * Map a score delta to an alert severity.
 *
 *  - |delta| < 5      → INFO
 *  - delta >= 5       → INFO   (positive moves are good news)
 *  - delta <= -5      → WARNING
 *  - delta <= -10     → CRITICAL
 */
export function severityForDelta(delta: number): "INFO" | "WARNING" | "CRITICAL" {
  if (delta <= -10) return "CRITICAL";
  if (delta <= -5) return "WARNING";
  return "INFO";
}

/**
 * Recompute and persist a single rep's score.
 * Returns the new REP_SCORE row, or null if mock mode / rep not found.
 *
 * Side effects (DB-mode only):
 *   - Re-scores every session in the 30-day window and writes
 *     SESSION.score + SESSION.flags (JSON-stringified).
 *   - When the new score differs from the prior persisted score, creates
 *     a SCORE_DELTA ALERT row carrying scoreDelta + driver semantics so
 *     the mobile feed has score-attributed events.
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

  // ---- Compare against prior persisted score (for SCORE_DELTA alert) --
  const prior = await prisma.rEP_SCORE.findFirst({
    where: { repId: rep.id, dimension: "overall" },
    orderBy: { calculatedAt: "desc" },
  });
  const priorScore = prior?.score ?? null;

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

  // ---- Score-delta feed event ----------------------------------------
  if (priorScore !== null && Math.round(priorScore) !== result.score) {
    const delta = result.score - priorScore;
    const driver = deriveScoreDeltaDriver(result, delta);
    const severity = severityForDelta(delta);
    const sign = delta >= 0 ? "+" : "";
    const title = `${sign}${Math.round(delta * 10) / 10} pts — ${driver}`;
    const message =
      `${rep.name}: score moved from ${Math.round(priorScore)} to ${result.score} ` +
      `(${driver.toLowerCase()}).`;

    await prisma.aLERT.create({
      data: {
        tenantId,
        type: "SCORE_DELTA",
        severity,
        title,
        message,
        scoreDelta: Math.round(delta * 10) / 10,
        driver,
      },
    });
  }

  // ---- Per-session scoring + flag persistence ------------------------
  // Mobile Me-tab needs each session to carry its own score + flags.
  for (const s of sessions) {
    const sessionResult = scoreSession(
      {
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        sentiment: s.sentiment,
        type: s.type,
      },
      { hireDate: rep.hireDate },
      now,
    );
    await prisma.sESSION.update({
      where: { id: s.id },
      data: {
        score: sessionResult.score,
        flags: JSON.stringify(sessionResult.flags),
      },
    });
  }

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
