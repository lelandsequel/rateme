// GET /api/rating-requests
//
// Returns rating requests where the current user is initiator OR target rep
// OR target rater. Each row is tagged with `direction` from the caller's
// point of view ("outgoing" if they initiated, "incoming" otherwise).

import { Prisma } from "@prisma/client";

import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicRater } from "@/lib/redact";

export async function GET() {
  return handle(async () => {
    const session = await requireSession();
    const userId = session.user.id;

    const where: Prisma.RatingRequestWhereInput = {
      OR: [
        { initiatedByUserId: userId },
        { forRepUserId: userId },
        { toRaterUserId: userId },
      ],
    };

    const rows = await prisma.ratingRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        forRep: {
          include: {
            repProfile: {
              include: { industry: { select: { slug: true, name: true } } },
            },
          },
        },
        initiatedBy: {
          select: { id: true, name: true, role: true },
        },
        rating: { select: { id: true } },
      },
    });

    // Pull the rater profiles in a separate query to avoid forcing an
    // optional include on RatingRequest (toRaterUserId is nullable).
    const raterIds = rows
      .map((r) => r.toRaterUserId)
      .filter((id): id is string => typeof id === "string");
    const raters = raterIds.length
      ? await prisma.user.findMany({
          where: { id: { in: raterIds } },
          include: {
            raterProfile: {
              include: {
                industry: { select: { slug: true, name: true } },
              },
            },
          },
        })
      : [];
    const raterById = new Map(raters.map((r) => [r.id, r]));

    return {
      requests: rows.map((r) => {
        const direction: "outgoing" | "incoming" =
          r.initiatedByUserId === userId ? "outgoing" : "incoming";
        const rater = r.toRaterUserId ? raterById.get(r.toRaterUserId) : null;
        return {
          id: r.id,
          type: r.type,
          status: r.status,
          direction,
          toEmail: r.toEmail,
          forRepUserId: r.forRepUserId,
          toRaterUserId: r.toRaterUserId,
          initiatedByUserId: r.initiatedByUserId,
          expiresAt: r.expiresAt,
          createdAt: r.createdAt,
          completedAt: r.completedAt,
          ratingId: r.rating?.id ?? null,
          forRep: r.forRep.repProfile
            ? {
                id: r.forRep.id,
                name: r.forRep.name,
                title: r.forRep.repProfile.title,
                company: r.forRep.repProfile.company,
                industry: r.forRep.repProfile.industry,
                state: r.forRep.state,
              }
            : null,
          toRater:
            rater && rater.raterProfile
              ? publicRater({
                  userId: rater.id,
                  user: rater,
                  title: rater.raterProfile.title,
                  company: rater.raterProfile.company,
                  industry: rater.raterProfile.industry,
                })
              : null,
        };
      }),
    };
  });
}
