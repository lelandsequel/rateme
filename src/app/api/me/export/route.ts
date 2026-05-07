// GET /api/me/export — JSON dump of everything connected to the calling
// user.
//
// RMR ethos: data is portable, your reputation is yours. Any user (any
// role) can download a complete snapshot of their data as a single JSON
// file. The endpoint sets Content-Disposition: attachment so browsers
// trigger a download.
//
// Privacy hygiene: in `ratingsReceived` we redact the rater identity
// (publicRater — title + company + industry only). For `ratingsGiven`
// the caller IS the rater, so we include the rep's full info.

import { Role } from "@prisma/client";

import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicRater } from "@/lib/redact";

export async function GET() {
  let session: { user: { id: string; email: string; name: string; role: string } };
  try {
    session = await requireSession();
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const userId = session.user.id;

  // ---- User + own profile ----
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      repProfile: {
        include: { industry: { select: { slug: true, name: true } } },
      },
      raterProfile: {
        include: { industry: { select: { slug: true, name: true } } },
      },
      managerProfile: true,
    },
  });

  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  // ---- Connections (both sides) ----
  const connections = await prisma.connection.findMany({
    where: {
      OR: [{ repUserId: userId }, { raterUserId: userId }],
    },
    orderBy: { requestedAt: "desc" },
    include: {
      rep: {
        include: {
          repProfile: {
            include: { industry: { select: { slug: true, name: true } } },
          },
        },
      },
      rater: {
        include: {
          raterProfile: {
            include: { industry: { select: { slug: true, name: true } } },
          },
        },
      },
    },
  });

  // ---- Ratings given (you authored these) ----
  const ratingsGiven = await prisma.rating.findMany({
    where: { raterUserId: userId },
    orderBy: { createdAt: "desc" },
    include: {
      rep: {
        include: {
          repProfile: {
            include: { industry: { select: { slug: true, name: true } } },
          },
        },
      },
    },
  });

  // ---- Ratings received (about you, rater REDACTED) ----
  const ratingsReceived = await prisma.rating.findMany({
    where: { repUserId: userId },
    orderBy: { createdAt: "desc" },
    include: {
      rater: {
        include: {
          raterProfile: {
            include: { industry: { select: { slug: true, name: true } } },
          },
        },
      },
    },
  });

  // ---- Rating requests (initiator + target) ----
  const ratingRequestsInitiated = await prisma.ratingRequest.findMany({
    where: { initiatedByUserId: userId },
    orderBy: { createdAt: "desc" },
  });
  const ratingRequestsAsTarget = await prisma.ratingRequest.findMany({
    where: { forRepUserId: userId },
    orderBy: { createdAt: "desc" },
  });

  // ---- Favorites (only meaningful for RATER, but harmless to include) ----
  const favoritesAsRater = await prisma.favorite.findMany({
    where: { raterUserId: userId },
    orderBy: { createdAt: "desc" },
    include: {
      rep: {
        include: {
          repProfile: {
            include: { industry: { select: { slug: true, name: true } } },
          },
        },
      },
    },
  });

  // ---- Memberships ----
  const managedMemberships = await prisma.teamMembership.findMany({
    where: { managerId: userId },
    orderBy: { invitedAt: "desc" },
    include: {
      member: {
        select: { id: true, name: true, email: true, role: true, state: true },
      },
    },
  });
  const membershipAsMember = await prisma.teamMembership.findFirst({
    where: { memberId: userId, endedAt: null },
    include: {
      manager: {
        select: { id: true, name: true, email: true, role: true, state: true },
      },
    },
  });

  // ---- Shape the payload ----
  const payload = {
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      state: user.state,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt,
      emailVerifiedAt: user.emailVerifiedAt,
    },
    profile: {
      rep: user.repProfile
        ? {
            title: user.repProfile.title,
            company: user.repProfile.company,
            metroArea: user.repProfile.metroArea,
            industry: user.repProfile.industry,
          }
        : null,
      rater: user.raterProfile
        ? {
            title: user.raterProfile.title,
            company: user.raterProfile.company,
            industry: user.raterProfile.industry,
          }
        : null,
      manager: user.managerProfile
        ? {
            managesType: user.managerProfile.managesType,
            company: user.managerProfile.company,
          }
        : null,
    },
    connections: connections.map((c) => ({
      id: c.id,
      status: c.status,
      initiatedBy: c.initiatedBy,
      requestedAt: c.requestedAt,
      respondedAt: c.respondedAt,
      role:
        c.repUserId === userId
          ? "REP"
          : c.raterUserId === userId
            ? "RATER"
            : "OBSERVER",
      rep: c.rep.repProfile
        ? {
            id: c.rep.id,
            name: c.rep.name,
            email: c.repUserId === userId ? c.rep.email : undefined,
            title: c.rep.repProfile.title,
            company: c.rep.repProfile.company,
            industry: c.rep.repProfile.industry,
            state: c.rep.state,
          }
        : null,
      rater:
        c.rater.raterProfile && c.raterUserId === userId
          ? {
              id: c.rater.id,
              name: c.rater.name,
              email: c.rater.email,
              title: c.rater.raterProfile.title,
              company: c.rater.raterProfile.company,
              industry: c.rater.raterProfile.industry,
              state: c.rater.state,
            }
          : c.rater.raterProfile
            ? publicRater({
                userId: c.rater.id,
                user: c.rater,
                title: c.rater.raterProfile.title,
                company: c.rater.raterProfile.company,
                industry: c.rater.raterProfile.industry,
              })
            : null,
    })),
    ratingsGiven: ratingsGiven.map((r) => ({
      id: r.id,
      connectionId: r.connectionId,
      responsiveness: r.responsiveness,
      productKnowledge: r.productKnowledge,
      followThrough: r.followThrough,
      listeningNeedsFit: r.listeningNeedsFit,
      trustIntegrity: r.trustIntegrity,
      takeCallAgain: r.takeCallAgain,
      createdAt: r.createdAt,
      // Caller authored these — full rep info.
      rep: r.rep.repProfile
        ? {
            id: r.rep.id,
            name: r.rep.name,
            title: r.rep.repProfile.title,
            company: r.rep.repProfile.company,
            industry: r.rep.repProfile.industry,
            state: r.rep.state,
          }
        : null,
    })),
    ratingsReceived: ratingsReceived.map((r) => ({
      id: r.id,
      connectionId: r.connectionId,
      responsiveness: r.responsiveness,
      productKnowledge: r.productKnowledge,
      followThrough: r.followThrough,
      listeningNeedsFit: r.listeningNeedsFit,
      trustIntegrity: r.trustIntegrity,
      takeCallAgain: r.takeCallAgain,
      createdAt: r.createdAt,
      // Rater identity REDACTED — privacy hygiene even for the rep being rated.
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
    ratingRequestsInitiated: ratingRequestsInitiated.map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      forRepUserId: r.forRepUserId,
      toEmail: r.toEmail,
      toRaterUserId: r.toRaterUserId,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
    })),
    ratingRequestsAsTarget: ratingRequestsAsTarget.map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      initiatedByUserId: r.initiatedByUserId,
      // toEmail can be a third party — leave it; it's data the rep already
      // knew (they were the target, the email is who got pinged on their
      // behalf).
      toEmail: r.toEmail,
      toRaterUserId: r.toRaterUserId,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
    })),
    favoritesAsRater:
      user.role === Role.RATER
        ? favoritesAsRater.map((f) => ({
            id: f.id,
            createdAt: f.createdAt,
            rep: f.rep.repProfile
              ? {
                  id: f.rep.id,
                  name: f.rep.name,
                  title: f.rep.repProfile.title,
                  company: f.rep.repProfile.company,
                  industry: f.rep.repProfile.industry,
                  state: f.rep.state,
                }
              : null,
          }))
        : [],
    managedMemberships: managedMemberships.map((m) => ({
      id: m.id,
      member: m.member,
      invitedAt: m.invitedAt,
      acceptedAt: m.acceptedAt,
      endedAt: m.endedAt,
    })),
    membershipAsMember: membershipAsMember
      ? {
          id: membershipAsMember.id,
          manager: membershipAsMember.manager,
          invitedAt: membershipAsMember.invitedAt,
          acceptedAt: membershipAsMember.acceptedAt,
          endedAt: membershipAsMember.endedAt,
        }
      : null,
  };

  const date = new Date().toISOString().slice(0, 10);
  const filename = `rmr-export-${userId}-${date}.json`;

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
