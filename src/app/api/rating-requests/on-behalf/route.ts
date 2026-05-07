// POST /api/rating-requests/on-behalf
//
// A SALES_MANAGER asks a connected rater to rate one of their reps.
// Constraints (per spec):
//   - The rep must be on the manager's team (active TeamMembership).
//   - An ACCEPTED Connection between (rep, rater) must exist.
//   - At most ONE ON_BEHALF request per (rep, rater) pair every 30 days.

import {
  ConnectionStatus,
  RatingRequestStatus,
  RatingRequestType,
  Role,
} from "@prisma/client";

import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

interface CreateBody {
  forRepUserId?: unknown;
  toRaterUserId?: unknown;
}

export async function POST(req: Request) {
  return handle(async () => {
    const session = await requireSession();
    if (session.user.role !== Role.SALES_MANAGER) {
      return Response.json(
        { error: "Only Sales Managers can request ratings on behalf" },
        { status: 403 },
      );
    }

    let body: CreateBody;
    try {
      body = (await req.json()) as CreateBody;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const forRepUserId =
      typeof body.forRepUserId === "string" ? body.forRepUserId : null;
    const toRaterUserId =
      typeof body.toRaterUserId === "string" ? body.toRaterUserId : null;
    if (!forRepUserId) {
      return Response.json({ error: "forRepUserId required" }, { status: 400 });
    }
    if (!toRaterUserId) {
      return Response.json({ error: "toRaterUserId required" }, { status: 400 });
    }

    // Rep must be on this manager's active team.
    const membership = await prisma.teamMembership.findFirst({
      where: {
        managerId: session.user.id,
        memberId: forRepUserId,
        acceptedAt: { not: null },
        endedAt: null,
      },
    });
    if (!membership) {
      return Response.json(
        { error: "That rep is not on your team" },
        { status: 403 },
      );
    }

    // ACCEPTED connection between (rep, rater) is required.
    const conn = await prisma.connection.findUnique({
      where: {
        repUserId_raterUserId: {
          repUserId: forRepUserId,
          raterUserId: toRaterUserId,
        },
      },
    });
    if (!conn || conn.status !== ConnectionStatus.ACCEPTED) {
      return Response.json(
        { error: "Rep and rater must have an accepted connection" },
        { status: 400 },
      );
    }

    // 30-day rate limit per (rep, rater) pair.
    const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);
    const recent = await prisma.ratingRequest.findFirst({
      where: {
        type: RatingRequestType.ON_BEHALF,
        forRepUserId,
        toRaterUserId,
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: "desc" },
    });
    if (recent) {
      const ageMs = Date.now() - recent.createdAt.getTime();
      const retryAfterDays = Math.max(
        1,
        Math.ceil((THIRTY_DAYS_MS - ageMs) / (24 * 60 * 60 * 1000)),
      );
      return Response.json(
        {
          error:
            "An on-behalf request for this rep+rater was already sent in the last 30 days",
          retryAfterDays,
        },
        { status: 429 },
      );
    }

    const expiresAt = new Date(Date.now() + FOURTEEN_DAYS_MS);
    const created = await prisma.ratingRequest.create({
      data: {
        type: RatingRequestType.ON_BEHALF,
        status: RatingRequestStatus.PENDING,
        forRepUserId,
        initiatedByUserId: session.user.id,
        toRaterUserId,
        expiresAt,
      },
    });

    return Response.json({ id: created.id, expiresAt: created.expiresAt });
  });
}
