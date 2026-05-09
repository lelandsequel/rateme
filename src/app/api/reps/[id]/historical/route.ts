// GET /api/reps/:id/historical
//
// Auth: any signed-in user.
//
// Returns:
//   monthly: 12 monthly buckets (oldest → newest) of avg overall + count for
//            ratings RECEIVED by this rep over the last 13 months.
//
// 404 when the user doesn't exist or isn't a REP.
//
// This is the per-rep counterpart to /api/team/historical's `monthly`. It
// reuses `monthlyTeamAggregates` from `@/lib/manager-historical` — the
// aggregator is rep-agnostic; we just feed it ratings scoped to one rep.

import { Role } from "@prisma/client";

import { handle, isValidId } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { monthlyTeamAggregates } from "@/lib/manager-historical";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    await requireSession();
    const { id } = await ctx.params;

    if (!isValidId(id)) {
      return Response.json({ error: "Rep not found" }, { status: 404 });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!user || user.role !== Role.REP) {
      return Response.json({ error: "Rep not found" }, { status: 404 });
    }

    // 13-month window — same posture as /api/team/historical so the chart
    // has the prior month available even though we only emit 12 buckets.
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - 13);
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);

    const ratings = await prisma.rating.findMany({
      where: { repUserId: id, createdAt: { gte: since } },
      select: {
        createdAt: true,
        answers: { select: { score: true } },
      },
    });

    const monthly = monthlyTeamAggregates(ratings, 12);
    return { monthly };
  });
}
