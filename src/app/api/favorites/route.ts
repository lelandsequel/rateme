// GET  /api/favorites — RATER only. List favorites with rep info populated.
// POST /api/favorites — RATER only. Body: { repUserId }. Idempotent: returns
//                       the existing favorite when one already exists.
//
// The Favorite row drives notification fan-out: any time a Rep gets a new
// rating, every Rater with a Favorite pointing at that Rep gets pinged.

import { Prisma, Role } from "@prisma/client";

import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aggregateRatings } from "@/lib/aggregates";

interface CreateBody {
  repUserId?: unknown;
}

export async function POST(req: Request) {
  return handle(async () => {
    const session = await requireSession();
    if (session.user.role !== Role.RATER) {
      return Response.json(
        { error: "Only Raters can favorite reps" },
        { status: 403 },
      );
    }

    let body: CreateBody;
    try {
      body = (await req.json()) as CreateBody;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const repUserId = typeof body.repUserId === "string" ? body.repUserId : null;
    if (!repUserId) {
      return Response.json({ error: "repUserId required" }, { status: 400 });
    }
    if (repUserId === session.user.id) {
      return Response.json({ error: "Can't favorite yourself" }, { status: 400 });
    }

    // Verify target is actually a REP — surfacing a 404 keeps fan-out
    // semantics tight (a non-rep favorite would never receive ratings).
    const target = await prisma.user.findUnique({
      where: { id: repUserId },
      select: { id: true, role: true },
    });
    if (!target || target.role !== Role.REP) {
      return Response.json({ error: "Target rep not found" }, { status: 404 });
    }

    // Idempotent: if a favorite already exists, return it.
    const existing = await prisma.favorite.findUnique({
      where: {
        raterUserId_repUserId: { raterUserId: session.user.id, repUserId },
      },
    });
    if (existing) {
      return Response.json({ favorite: existing, alreadyExisted: true });
    }

    try {
      const favorite = await prisma.favorite.create({
        data: { raterUserId: session.user.id, repUserId },
      });
      return Response.json({ favorite, alreadyExisted: false });
    } catch (err) {
      // Race: another concurrent request created it; surface the row.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const row = await prisma.favorite.findUnique({
          where: {
            raterUserId_repUserId: { raterUserId: session.user.id, repUserId },
          },
        });
        if (row) {
          return Response.json({ favorite: row, alreadyExisted: true });
        }
      }
      throw err;
    }
  });
}

export async function GET() {
  return handle(async () => {
    const session = await requireSession();
    if (session.user.role !== Role.RATER) {
      return Response.json(
        { error: "Only Raters can list favorites" },
        { status: 403 },
      );
    }

    const favorites = await prisma.favorite.findMany({
      where: { raterUserId: session.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        rep: {
          include: {
            repProfile: {
              include: { industry: { select: { slug: true, name: true } } },
            },
            ratingsReceived: {
              select: {
                responsiveness: true,
                productKnowledge: true,
                followThrough: true,
                listeningNeedsFit: true,
                trustIntegrity: true,
                takeCallAgain: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    return {
      favorites: favorites
        .filter((f) => f.rep.repProfile)
        .map((f) => {
          const agg = aggregateRatings(f.rep.ratingsReceived, f.rep.avatarUrl);
          return {
            id: f.id,
            createdAt: f.createdAt,
            rep: {
              id: f.rep.id,
              name: f.rep.name,
              state: f.rep.state,
              title: f.rep.repProfile!.title,
              company: f.rep.repProfile!.company,
              industry: f.rep.repProfile!.industry,
              metroArea: f.rep.repProfile!.metroArea,
            },
            aggregates: {
              status: agg.status,
              overall: agg.overall,
              ratingCount: agg.ratingCount,
              ratingsThisYear: agg.ratingsThisYear,
              takeCallAgainPct: agg.takeCallAgainPct,
            },
          };
        }),
    };
  });
}
