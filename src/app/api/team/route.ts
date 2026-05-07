// GET /api/team — current user's team view.
//
// Manager (SALES_MANAGER / RATER_MANAGER) → list of their managed members
// (pending + active). Privacy redaction does NOT apply to a manager
// viewing their own team — by spec, managers see full info on their reps
// or full info on their raters (canSeeFullRater allows it).
//
// Member (REP / RATER / others) → list of memberships where they are the
// member, with manager info attached.

import { Role } from "@prisma/client";

import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  return handle(async () => {
    const session = await requireSession();
    const userId = session.user.id;
    const role = session.user.role;

    if (role === Role.SALES_MANAGER || role === Role.RATER_MANAGER) {
      const memberships = await prisma.teamMembership.findMany({
        where: { managerId: userId, endedAt: null },
        orderBy: { invitedAt: "desc" },
        include: {
          member: {
            include: {
              repProfile: {
                include: { industry: { select: { slug: true, name: true } } },
              },
              raterProfile: {
                include: { industry: { select: { slug: true, name: true } } },
              },
              _count: { select: { ratingsReceived: true } },
            },
          },
        },
      });

      return {
        role: "manager" as const,
        members: memberships.map((m) => ({
          membershipId: m.id,
          status: m.acceptedAt ? ("active" as const) : ("pending" as const),
          invitedAt: m.invitedAt,
          acceptedAt: m.acceptedAt,
          member: {
            id: m.member.id,
            name: m.member.name,
            email: m.member.email,
            role: m.member.role,
            state: m.member.state,
            repProfile: m.member.repProfile
              ? {
                  title: m.member.repProfile.title,
                  company: m.member.repProfile.company,
                  industry: m.member.repProfile.industry,
                  metroArea: m.member.repProfile.metroArea,
                  recentRatingCount: m.member._count.ratingsReceived,
                }
              : null,
            raterProfile: m.member.raterProfile
              ? {
                  title: m.member.raterProfile.title,
                  company: m.member.raterProfile.company,
                  industry: m.member.raterProfile.industry,
                }
              : null,
          },
        })),
      };
    }

    // Non-manager: list memberships where I'm the member.
    const memberships = await prisma.teamMembership.findMany({
      where: { memberId: userId, endedAt: null },
      orderBy: { invitedAt: "desc" },
      include: {
        manager: {
          include: { managerProfile: true },
        },
      },
    });

    return {
      role: "member" as const,
      memberships: memberships.map((m) => ({
        membershipId: m.id,
        status: m.acceptedAt ? ("active" as const) : ("pending" as const),
        invitedAt: m.invitedAt,
        acceptedAt: m.acceptedAt,
        manager: {
          id: m.manager.id,
          name: m.manager.name,
          company: m.manager.managerProfile?.company ?? null,
          managesType: m.manager.managerProfile?.managesType ?? null,
        },
      })),
    };
  });
}
