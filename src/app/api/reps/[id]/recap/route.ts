// GET /api/reps/:id/recap — 30-day AI recap of ratings received by a rep.
//
// Visible to:
//   • the rep themselves
//   • a SALES_MANAGER who currently manages them via TeamMembership
//     (active = endedAt is null).

import { Role } from "@prisma/client";

import { handle, isValidId } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { generateRecap } from "@/lib/ai-recap";
import { prisma } from "@/lib/prisma";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const session = await requireSession();
    const { id } = await ctx.params;
    if (!isValidId(id)) {
      return Response.json({ error: "Invalid rep id" }, { status: 400 });
    }

    const rep = await prisma.user.findUnique({
      where: { id },
      include: { repProfile: { select: { company: true } } },
    });
    if (!rep || rep.role !== Role.REP || !rep.repProfile) {
      return Response.json({ error: "Rep not found" }, { status: 404 });
    }

    const isSelf = session.user.id === rep.id;
    let allowed = isSelf;
    if (!allowed && session.user.role === Role.SALES_MANAGER) {
      const membership = await prisma.teamMembership.findFirst({
        where: {
          managerId: session.user.id,
          memberId: rep.id,
          endedAt: null,
        },
        select: { id: true },
      });
      allowed = !!membership;
    }
    if (!allowed) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const since = new Date(Date.now() - THIRTY_DAYS_MS);
    const ratings = await prisma.rating.findMany({
      where: { repUserId: rep.id, createdAt: { gte: since } },
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

    const recap = await generateRecap({
      ratings,
      perspective: "REP",
      name: rep.name,
      company: rep.repProfile.company,
    });

    return recap;
  });
}
