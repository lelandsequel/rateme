// GET    /api/connections — list current user's connections (both directions).
// POST   /api/connections — request a new connection. Either side initiates.
//
// Body for POST: { otherUserId } — the OTHER party's userId. The current
// user's role determines which side of the connection they are.
//
// Status starts PENDING. The other side must PATCH to ACCEPTED for the
// connection to gate ratings.

import { Role, ConnectionInitiator, ConnectionStatus } from "@prisma/client";

import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicRater } from "@/lib/redact";

export async function GET() {
  return handle(async () => {
    const session = await requireSession();

    // A user is on either side of a Connection. Pull both directions.
    const conns = await prisma.connection.findMany({
      where: {
        OR: [
          { repUserId: session.user.id },
          { raterUserId: session.user.id },
        ],
      },
      orderBy: { requestedAt: "desc" },
      include: {
        rep: {
          include: {
            repProfile: { include: { industry: { select: { slug: true, name: true } } } },
          },
        },
        rater: {
          include: {
            raterProfile: { include: { industry: { select: { slug: true, name: true } } } },
          },
        },
      },
    });

    return {
      connections: conns.map((c) => ({
        id: c.id,
        status: c.status,
        initiatedBy: c.initiatedBy,
        requestedAt: c.requestedAt,
        respondedAt: c.respondedAt,
        // Always send rep info in full; redact rater unless I AM the rater.
        rep: c.rep.repProfile
          ? {
              id: c.rep.id,
              name: c.rep.name,
              title: c.rep.repProfile.title,
              company: c.rep.repProfile.company,
              industry: c.rep.repProfile.industry,
              state: c.rep.state,
            }
          : null,
        rater:
          c.rater.raterProfile
            ? c.raterUserId === session.user.id
              ? {
                  // self-view: full identity
                  id: c.rater.id,
                  name: c.rater.name,
                  title: c.rater.raterProfile.title,
                  company: c.rater.raterProfile.company,
                  industry: c.rater.raterProfile.industry,
                  state: c.rater.state,
                }
              : publicRater({
                  userId: c.rater.id,
                  user: c.rater,
                  title: c.rater.raterProfile.title,
                  company: c.rater.raterProfile.company,
                  industry: c.rater.raterProfile.industry,
                })
            : null,
      })),
    };
  });
}

interface CreateBody {
  otherUserId?: unknown;
}

export async function POST(req: Request) {
  return handle(async () => {
    const session = await requireSession();
    if (session.user.role !== Role.REP && session.user.role !== Role.RATER) {
      return Response.json(
        { error: "Only Reps and Raters can request connections" },
        { status: 403 },
      );
    }

    let body: CreateBody;
    try {
      body = (await req.json()) as CreateBody;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const otherUserId = typeof body.otherUserId === "string" ? body.otherUserId : null;
    if (!otherUserId) {
      return Response.json({ error: "otherUserId required" }, { status: 400 });
    }
    if (otherUserId === session.user.id) {
      return Response.json({ error: "Can't connect to yourself" }, { status: 400 });
    }

    const other = await prisma.user.findUnique({
      where: { id: otherUserId },
      select: { id: true, role: true },
    });
    if (!other) {
      return Response.json({ error: "Target user not found" }, { status: 404 });
    }

    // Connections are always (REP, RATER). Reject same-role connections.
    let repUserId: string;
    let raterUserId: string;
    let initiatedBy: ConnectionInitiator;
    if (session.user.role === Role.REP && other.role === Role.RATER) {
      repUserId = session.user.id;
      raterUserId = other.id;
      initiatedBy = ConnectionInitiator.REP;
    } else if (session.user.role === Role.RATER && other.role === Role.REP) {
      repUserId = other.id;
      raterUserId = session.user.id;
      initiatedBy = ConnectionInitiator.RATER;
    } else {
      return Response.json(
        { error: "Connection must be between a REP and a RATER" },
        { status: 400 },
      );
    }

    // Idempotent: if a connection already exists, return it.
    const existing = await prisma.connection.findUnique({
      where: { repUserId_raterUserId: { repUserId, raterUserId } },
    });
    if (existing) {
      return Response.json({ connection: existing, alreadyExisted: true });
    }

    const created = await prisma.connection.create({
      data: {
        repUserId,
        raterUserId,
        initiatedBy,
        status: ConnectionStatus.PENDING,
      },
    });

    return Response.json({ connection: created, alreadyExisted: false });
  });
}
