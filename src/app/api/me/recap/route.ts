// GET /api/me/recap — 30-day AI recap for the authenticated user.
//
// REP    → ratings received in last 30 days
// RATER  → ratings given in last 30 days
// ADMIN/MANAGER → 400 (recap is only meaningful per individual REP/RATER).

import { Role } from "@prisma/client";

import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { generateRecap } from "@/lib/ai-recap";
import { prisma } from "@/lib/prisma";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET() {
  return handle(async () => {
    const session = await requireSession();
    const role = session.user.role;

    if (role !== Role.REP && role !== Role.RATER) {
      return Response.json(
        { error: "recap is for REP/RATER perspectives" },
        { status: 400 },
      );
    }

    const since = new Date(Date.now() - THIRTY_DAYS_MS);

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        repProfile: { select: { company: true } },
        raterProfile: { select: { company: true } },
      },
    });
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const ratings = await prisma.rating.findMany({
      where:
        role === Role.REP
          ? { repUserId: user.id, createdAt: { gte: since } }
          : { raterUserId: user.id, createdAt: { gte: since } },
      select: {
        responsiveness: true,
        productKnowledge: true,
        followThrough: true,
        listeningNeedsFit: true,
        trustIntegrity: true,
        takeCallAgain: true,
        createdAt: true,
      },
    });

    const company =
      role === Role.REP
        ? user.repProfile?.company ?? ""
        : user.raterProfile?.company ?? "";

    const recap = await generateRecap({
      ratings,
      perspective: role === Role.REP ? "REP" : "RATER",
      name: user.name,
      company,
    });

    return recap;
  });
}
