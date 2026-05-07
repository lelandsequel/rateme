// GET /api/reps/:id/rankings — rankings for a target rep.
//
// Visibility mirrors /api/reps/:id — any authenticated user can view rep
// detail, so any authenticated user can view rep rankings.

import { Role } from "@prisma/client";

import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { repIndustryRegionalRanking, repTeamRanking } from "@/lib/rankings";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    await requireSession();
    const { id } = await ctx.params;

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!target || target.role !== Role.REP) {
      return Response.json({ error: "Rep not found" }, { status: 404 });
    }

    const [team, industryRegional] = await Promise.all([
      repTeamRanking(prisma, id),
      repIndustryRegionalRanking(prisma, id),
    ]);
    return { team, industryRegional };
  });
}
