// GET /api/team/connections — manager's cross-side aggregation view.
//
// SALES_MANAGER: lists every Rater accepted-connected to any of my Reps.
// RATER_MANAGER: lists every Rep accepted-connected to any of my Raters.
//
// Output is de-duped per "other side" entity, with all opposing reps/raters
// they touch listed inline. Raters are always redacted via publicRater().

import { ConnectionStatus, Role } from "@prisma/client";

import { handle } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicRater, type PublicRater } from "@/lib/redact";

export async function GET() {
  return handle(async () => {
    const session = await requireRole(Role.SALES_MANAGER, Role.RATER_MANAGER);
    const managerId = session.user.id;

    const memberships = await prisma.teamMembership.findMany({
      where: { managerId, endedAt: null, acceptedAt: { not: null } },
      select: { memberId: true },
    });
    const memberIds = memberships.map((m) => m.memberId);

    if (memberIds.length === 0) {
      return session.user.role === Role.SALES_MANAGER
        ? { raters: [] }
        : { reps: [] };
    }

    if (session.user.role === Role.SALES_MANAGER) {
      const conns = await prisma.connection.findMany({
        where: {
          status: ConnectionStatus.ACCEPTED,
          repUserId: { in: memberIds },
        },
        include: {
          rep: { select: { id: true, name: true } },
          rater: {
            include: {
              raterProfile: {
                include: { industry: { select: { slug: true, name: true } } },
              },
            },
          },
        },
      });

      const byRater = new Map<
        string,
        { rater: PublicRater; connectedToReps: Array<{ repId: string; repName: string }> }
      >();

      for (const c of conns) {
        if (!c.rater.raterProfile) continue;
        const existing = byRater.get(c.raterUserId);
        const repEntry = { repId: c.rep.id, repName: c.rep.name };
        if (existing) {
          if (!existing.connectedToReps.find((r) => r.repId === repEntry.repId)) {
            existing.connectedToReps.push(repEntry);
          }
          continue;
        }
        byRater.set(c.raterUserId, {
          rater: publicRater({
            userId: c.rater.id,
            user: c.rater,
            title: c.rater.raterProfile.title,
            company: c.rater.raterProfile.company,
            industry: c.rater.raterProfile.industry,
          }),
          connectedToReps: [repEntry],
        });
      }

      return {
        raters: Array.from(byRater.values()).map((v) => ({
          ...v.rater,
          connectedToReps: v.connectedToReps,
        })),
      };
    }

    // RATER_MANAGER
    const conns = await prisma.connection.findMany({
      where: {
        status: ConnectionStatus.ACCEPTED,
        raterUserId: { in: memberIds },
      },
      include: {
        rep: {
          include: {
            repProfile: {
              include: { industry: { select: { slug: true, name: true } } },
            },
          },
        },
        rater: {
          include: { raterProfile: true },
        },
      },
    });

    const byRep = new Map<
      string,
      {
        id: string;
        name: string;
        title: string;
        company: string;
        industry: { slug: string; name: string };
        connectedToRaters: Array<{
          raterId: string;
          raterTitle: string;
          raterCompany: string;
        }>;
      }
    >();

    for (const c of conns) {
      if (!c.rep.repProfile) continue;
      const raterTitle = c.rater.raterProfile?.title ?? "";
      const raterCompany = c.rater.raterProfile?.company ?? "";
      const raterEntry = {
        raterId: c.rater.id,
        raterTitle,
        raterCompany,
      };
      const existing = byRep.get(c.repUserId);
      if (existing) {
        if (!existing.connectedToRaters.find((r) => r.raterId === raterEntry.raterId)) {
          existing.connectedToRaters.push(raterEntry);
        }
        continue;
      }
      byRep.set(c.repUserId, {
        id: c.rep.id,
        name: c.rep.name,
        title: c.rep.repProfile.title,
        company: c.rep.repProfile.company,
        industry: c.rep.repProfile.industry,
        connectedToRaters: [raterEntry],
      });
    }

    return { reps: Array.from(byRep.values()) };
  });
}
