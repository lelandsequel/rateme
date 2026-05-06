// GET /api/reps/:id — full rep detail page payload.
//
// Includes profile + rating aggregates (avg per dim, takeCallAgain%, status
// tier). Ratings list is on a separate endpoint to keep this fast and
// pageable.

import { Role } from "@prisma/client";

import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { aggregateRatings } from "@/lib/aggregates";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    await requireSession();
    const { id } = await ctx.params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        repProfile: { include: { industry: { select: { slug: true, name: true } } } },
        ratingsReceived: {
          select: {
            responsiveness: true,
            productKnowledge: true,
            followThrough: true,
            listeningNeedsFit: true,
            trustIntegrity: true,
            takeCallAgain: true,
            createdAt: true,
          },
        },
      },
    });
    if (!user || user.role !== Role.REP || !user.repProfile) {
      return Response.json({ error: "Rep not found" }, { status: 404 });
    }

    const aggregates = aggregateRatings(user.ratingsReceived);

    return {
      id: user.id,
      name: user.name,
      state: user.state,
      avatarUrl: user.avatarUrl,
      title: user.repProfile.title,
      company: user.repProfile.company,
      metroArea: user.repProfile.metroArea,
      bio: user.repProfile.bio,
      industry: user.repProfile.industry,
      aggregates,
    };
  });
}
