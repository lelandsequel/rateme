// GET /api/question-sets/by-industry/:industrySlug
//
// Public, no auth — the rating form (web + mobile) needs to render the
// rep's industry's question set BEFORE the rater submits. Since reps
// are public-discoverable, the question set tied to their industry is
// just as public.
//
// Returns:
//   { questionSet: { slug, name, questions: [{ id, key, ord, labelEn, labelEs, labelPt }] } }
//
// 404s when:
//   - the industry slug is unknown
//   - the industry has no question set linked

import { handle } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ industrySlug: string }> },
) {
  return handle(async () => {
    const { industrySlug } = await ctx.params;

    const industry = await prisma.industry.findUnique({
      where: { slug: industrySlug },
      select: {
        questionSet: {
          select: {
            slug: true,
            name: true,
            questions: {
              orderBy: { ord: "asc" },
              select: {
                id: true,
                key: true,
                ord: true,
                labelEn: true,
                labelEs: true,
                labelPt: true,
              },
            },
          },
        },
      },
    });

    if (!industry) {
      return Response.json({ error: "Industry not found" }, { status: 404 });
    }
    if (!industry.questionSet) {
      return Response.json(
        { error: "Industry has no question set configured" },
        { status: 404 },
      );
    }

    return { questionSet: industry.questionSet };
  });
}
