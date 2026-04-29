/**
 * GET /api/reps/:id/coaching
 *
 * Returns 1..3 actionable coaching insights for the given rep, derived
 * from the rep's latest QUASAR result + recent session flag history.
 *
 * Response: { insights: string[] }
 *
 * Tenant-scoped via requireTenant(). Mock-mode synthesizes a QUASAR-shaped
 * payload from the bundled mockReps fixture so the mobile app can develop
 * offline.
 */

import { handle, isValidId } from "@/lib/api";
import { requireTenant } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HAS_DB } from "@/lib/env";
import { mockReps } from "@/lib/mock";
import {
  aggregateRepSignals,
  scoreRep,
  scoreSession,
  type QuasarResult,
} from "@/lib/quasar";
import { getCoachingInsights, type CoachingSessionLike } from "@/lib/coaching";

const MS_PER_DAY = 86_400_000;

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (!isValidId(id)) {
      return Response.json({ error: "Invalid rep id" }, { status: 400 });
    }

    // ---- Mock mode -----------------------------------------------------
    if (!HAS_DB) {
      const rep = mockReps.find((r) => r.id === id);
      if (!rep) return Response.json({ error: "Not found" }, { status: 404 });

      // Synthesize a QUASAR result from the mock score so we can drive
      // the same mapping logic. Reasons + band are inferred from score.
      const score = rep.scores[0]?.score ?? 0;
      const band: QuasarResult["band"] =
        score >= 90 ? "thriving"
        : score >= 75 ? "steady"
        : score >= 60 ? "watch"
        : "at-risk";
      const fakeReasons: string[] =
        band === "thriving"
          ? ["High activity volume (15 sessions in last 7 days).",
             "Pipeline win rate strong (72%)."]
          : band === "steady"
          ? ["Steady activity (6 sessions in last 7 days).",
             "Pipeline win rate moderate (52%)."]
          : band === "watch"
          ? ["Low activity volume (3 sessions in last 7 days).",
             "Pipeline win rate weak (28%)."]
          : ["No activity in 12 days — score conservatively penalized.",
             "Pipeline win rate weak (15%)."];

      const fakeQuasar: QuasarResult = {
        score,
        confidence: rep.scores[0]?.confidence ?? 0.7,
        band,
        reasons: fakeReasons,
        breakdown: {
          activityVolumeContribution: 0.6,
          sentimentContribution: 0.55,
          pipelineProgressContribution: 0.5,
          pipelineWinRateContribution: 0.5,
          recencyMultiplier: band === "at-risk" ? 0.6 : 1.0,
          tenureAdjustment: 0,
        },
      };

      // Synthesize session flags from mock session sentiment so the
      // low-sentiment rule can fire when appropriate.
      const recentSessions: CoachingSessionLike[] = (rep.sessions ?? []).map(
        (s) => ({
          flags: typeof s.sentiment === "number" && s.sentiment <= 0.4
            ? ["low-sentiment"]
            : [],
        }),
      );

      const insights = getCoachingInsights(fakeQuasar, recentSessions);
      return { insights };
    }

    // ---- DB mode ------------------------------------------------------
    const tenantId = await requireTenant();

    const rep = await prisma.rEP.findFirst({
      where: { id, tenantId },
    });
    if (!rep) return Response.json({ error: "Not found" }, { status: 404 });

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * MS_PER_DAY);
    const sessions = await prisma.sESSION.findMany({
      where: {
        repId: rep.id,
        tenantId,
        startedAt: { gte: thirtyDaysAgo },
      },
    });

    // Re-derive QUASAR result on the fly so coaching is never stale
    // relative to the underlying signals — same approach as recompute.
    const signals = aggregateRepSignals(
      { hireDate: rep.hireDate },
      sessions.map((s) => ({
        startedAt: s.startedAt,
        sentiment: s.sentiment,
        type: s.type,
      })),
      [],
      now,
    );
    const quasar = scoreRep(signals);

    // Collect session flags. Prefer persisted SESSION.flags if present;
    // fall back to a fresh scoreSession() per-row otherwise.
    const recentSessions: CoachingSessionLike[] = sessions.map((s) => {
      let flags: string[] = [];
      if (s.flags) {
        try {
          const parsed = JSON.parse(s.flags) as unknown;
          if (Array.isArray(parsed)) {
            flags = parsed.filter((x): x is string => typeof x === "string");
          }
        } catch {
          // ignore malformed JSON; fall through to recompute path.
        }
      }
      if (flags.length === 0 && s.score == null) {
        const fresh = scoreSession(
          {
            startedAt: s.startedAt,
            endedAt: s.endedAt,
            sentiment: s.sentiment,
            type: s.type,
          },
          { hireDate: rep.hireDate },
          now,
        );
        flags = fresh.flags;
      }
      return { flags };
    });

    const insights = getCoachingInsights(quasar, recentSessions);
    return { insights };
  });
}
