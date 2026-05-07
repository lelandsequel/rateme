// GET /api/me/training-recs — REP-only. Returns up to three training
// recommendations for the current rep, computed from the last 90 days
// of incoming ratings.
//
// Auth: required. Roles: REP only — for any other role we return 400
// (training recs apply to reps; surfacing them to a rater would be
// nonsensical). The thin wrapper shape mirrors /api/me/recap.

import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recommendTraining } from "@/lib/training-recs";
import { Role } from "@prisma/client";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export async function GET() {
  return handle(async () => {
    const session = await requireSession();
    if (session.user.role !== Role.REP) {
      return Response.json(
        { error: "Training recommendations are only available for reps." },
        { status: 400 },
      );
    }

    const since = new Date(Date.now() - NINETY_DAYS_MS);
    const ratings = await prisma.rating.findMany({
      where: { repUserId: session.user.id, createdAt: { gte: since } },
      select: {
        responsiveness: true,
        productKnowledge: true,
        followThrough: true,
        listeningNeedsFit: true,
        trustIntegrity: true,
        createdAt: true,
      },
    });

    return { recs: recommendTraining(ratings) };
  });
}
