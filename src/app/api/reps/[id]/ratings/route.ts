// GET /api/reps/:id/ratings — paginated list of ratings on a rep.
//
// Returns the rater's name + title + company + industry + state and the
// optional comment. Email remains hidden. Order: most recent first.

import { handle, parseIntParam } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicRater } from "@/lib/redact";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    await requireSession();
    const { id: repUserId } = await ctx.params;

    const url = new URL(req.url);
    const limit = parseIntParam(url.searchParams.get("limit"), 25, 1, 100);
    const offset = parseIntParam(url.searchParams.get("offset"), 0, 0, 10_000);

    const [rows, total] = await Promise.all([
      prisma.rating.findMany({
        where: { repUserId },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          rater: {
            include: {
              raterProfile: {
                include: { industry: { select: { slug: true, name: true } } },
              },
            },
          },
        },
      }),
      prisma.rating.count({ where: { repUserId } }),
    ]);

    return {
      ratings: rows.map((r) => ({
        id: r.id,
        responsiveness: r.responsiveness,
        productKnowledge: r.productKnowledge,
        followThrough: r.followThrough,
        listeningNeedsFit: r.listeningNeedsFit,
        trustIntegrity: r.trustIntegrity,
        takeCallAgain: r.takeCallAgain,
        comment: r.comment,
        createdAt: r.createdAt,
        // Name now visible; email still hidden.
        rater: r.rater.raterProfile
          ? publicRater({
              userId: r.rater.id,
              user: r.rater,
              title: r.rater.raterProfile.title,
              company: r.rater.raterProfile.company,
              industry: r.rater.raterProfile.industry,
            })
          : null,
      })),
      total,
      limit,
      offset,
    };
  });
}
