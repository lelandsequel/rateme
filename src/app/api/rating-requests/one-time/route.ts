// POST /api/rating-requests/one-time
//
// A REP sends a one-shot rating invitation to an email. The recipient may
// or may not have an account yet. The eventual /rate/<id> public page
// drives the signup-or-sign-in-then-rate flow.
//
// Guardrails:
//   - 400 if the email already belongs to a user that has an ACCEPTED
//     connection with this rep (they don't need an invite — they can
//     just rate from their dashboard).
//   - 429 if the same email got a non-EXPIRED ONE_TIME request from the
//     same rep in the last 7 days (anti-spam).

import {
  ConnectionStatus,
  RatingRequestStatus,
  RatingRequestType,
  Role,
} from "@prisma/client";

import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

interface CreateBody {
  toEmail?: unknown;
}

export async function POST(req: Request) {
  return handle(async () => {
    const session = await requireSession();
    if (session.user.role !== Role.REP) {
      return Response.json(
        { error: "Only Reps can send one-time rating invitations" },
        { status: 403 },
      );
    }

    let body: CreateBody;
    try {
      body = (await req.json()) as CreateBody;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const rawEmail = typeof body.toEmail === "string" ? body.toEmail.trim() : "";
    if (!rawEmail || !EMAIL_RE.test(rawEmail)) {
      return Response.json(
        { error: "toEmail must be a valid email address" },
        { status: 400 },
      );
    }
    const toEmail = rawEmail.toLowerCase();

    // Rep must have a profile (this is the user we're inviting people to rate).
    const rep = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { repProfile: true },
    });
    if (!rep?.repProfile) {
      return Response.json(
        { error: "Rep profile not found — finish your profile first" },
        { status: 400 },
      );
    }

    // If the email is an existing user AND that user already has an
    // ACCEPTED connection with this rep, an invite is unnecessary.
    const existingUser = await prisma.user.findUnique({
      where: { email: toEmail },
      select: { id: true },
    });
    if (existingUser) {
      const conn = await prisma.connection.findUnique({
        where: {
          repUserId_raterUserId: {
            repUserId: rep.id,
            raterUserId: existingUser.id,
          },
        },
      });
      if (conn?.status === ConnectionStatus.ACCEPTED) {
        return Response.json(
          {
            error:
              "That rater is already connected to you — they can rate from their dashboard.",
          },
          { status: 400 },
        );
      }
    }

    // Spam guard: same rep, same email, non-EXPIRED in last 7d.
    const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
    const recent = await prisma.ratingRequest.findFirst({
      where: {
        type: RatingRequestType.ONE_TIME,
        forRepUserId: rep.id,
        toEmail,
        createdAt: { gte: cutoff },
        status: { not: RatingRequestStatus.EXPIRED },
      },
      orderBy: { createdAt: "desc" },
    });
    if (recent) {
      return Response.json(
        {
          error: "An invite was already sent to this email in the last 7 days.",
          existingId: recent.id,
        },
        { status: 429 },
      );
    }

    const expiresAt = new Date(Date.now() + THIRTY_DAYS_MS);
    const created = await prisma.ratingRequest.create({
      data: {
        type: RatingRequestType.ONE_TIME,
        status: RatingRequestStatus.PENDING,
        forRepUserId: rep.id,
        initiatedByUserId: rep.id,
        toEmail,
        expiresAt,
      },
    });

    return Response.json({
      id: created.id,
      expiresAt: created.expiresAt,
      inviteUrl: `/rate/${created.id}`,
    });
  });
}
