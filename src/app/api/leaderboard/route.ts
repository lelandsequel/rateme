/**
 * GET /api/leaderboard
 *
 * Tenant-scoped leaderboard for the mobile app's Rankings tab.
 *
 * Query params:
 *   - teamId  (optional)  → restrict ranking to a single team
 *   - limit   (default 50, max 200)
 *
 * Response:
 *   {
 *     scope: "tenant" | "team",
 *     scopeId: string,
 *     totalReps: number,
 *     reps: Array<{
 *       repId: string,
 *       name: string,
 *       teamName: string,
 *       score: number,
 *       band: "thriving"|"steady"|"watch"|"at-risk",
 *       rank: number,        // 1-indexed; ties share rank, next slot skips
 *       percentile: number,  // 0-100
 *       trend: "up"|"flat"|"down",  // delta vs second-latest score (if present)
 *       confidence: number,
 *     }>,
 *   }
 *
 * Tenant-scoped via requireTenant(). Mock-mode falls back to the bundled
 * mockReps fixture so the mobile app can develop offline.
 */

import { handle, parseIntParam } from "@/lib/api";
import { requireTenant } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HAS_DB } from "@/lib/env";
import { mockReps, mockTenant, mockTeams } from "@/lib/mock";
import { rankReps, type RepInput } from "@/lib/leaderboard";

export async function GET(request: Request) {
  return handle(async () => {
    const url = new URL(request.url);
    const teamId = url.searchParams.get("teamId");
    const limit = parseIntParam(url.searchParams.get("limit"), 50, 1, 200);

    // ---- Mock mode -----------------------------------------------------
    if (!HAS_DB) {
      let reps = mockReps;
      if (teamId) reps = reps.filter((r) => r.teamId === teamId);

      const inputs: RepInput[] = reps.map((r) => ({
        id: r.id,
        name: r.name,
        teamName: r.team?.name ?? "—",
        latestScore: r.scores[0]?.score ?? 0,
        latestConfidence: r.scores[0]?.confidence ?? 0,
        previousScore: r.scores[1]?.score ?? null,
      }));

      const ranked = rankReps(inputs).slice(0, limit);
      const scope: "tenant" | "team" = teamId ? "team" : "tenant";
      const scopeId = teamId
        ? mockTeams.find((t) => t.id === teamId)?.id ?? teamId
        : mockTenant.id;

      return {
        scope,
        scopeId,
        totalReps: reps.length,
        reps: ranked,
      };
    }

    // ---- DB mode ------------------------------------------------------
    const tenantId = await requireTenant();

    const reps = await prisma.rEP.findMany({
      where: {
        tenantId,
        status: "ACTIVE",
        ...(teamId ? { teamId } : {}),
      },
      include: {
        team: { select: { name: true } },
        scores: {
          where: { dimension: "overall" },
          orderBy: { calculatedAt: "desc" },
          take: 2, // latest + one prior for trend
        },
      },
    });

    const inputs: RepInput[] = reps.map((r) => ({
      id: r.id,
      name: r.name,
      teamName: r.team?.name ?? "—",
      latestScore: r.scores[0]?.score ?? 0,
      latestConfidence: r.scores[0]?.confidence ?? 0,
      previousScore: r.scores[1]?.score ?? null,
    }));

    const ranked = rankReps(inputs).slice(0, limit);
    const scope: "tenant" | "team" = teamId ? "team" : "tenant";
    const scopeId = teamId ?? tenantId;

    return {
      scope,
      scopeId,
      totalReps: reps.length,
      reps: ranked,
    };
  });
}
