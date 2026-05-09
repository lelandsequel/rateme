// POST /api/ratings — submit a rating from a Rater to a Rep.
//
// Hard requirements (per spec):
//   • Caller must be a RATER.
//   • Connection (caller, target rep) must exist with status ACCEPTED.
//   • Body shape: { repUserId, comment?, answers: [{ questionKey, score: 1-5 }] }
//   • Every question in the rep's industry's QuestionSet must be answered.
//   • Each score is an int 1-5; comment ≤ 500 chars.
//
// Optional: if ratingRequestId is supplied, validate it belongs to this
// (rep, rater) pair, is PENDING, and isn't past expiresAt. If valid, mark
// the rating with that requestId AND flip the request to COMPLETED in the
// same transaction.

import {
  ConnectionStatus,
  RatingRequestStatus,
  Role,
} from "@prisma/client";

import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyFavoritesOfRating } from "@/lib/notify-favorites";

interface AnswerInput {
  questionKey?: unknown;
  score?: unknown;
}

interface SubmitBody {
  repUserId?: unknown;
  comment?: unknown;
  answers?: unknown;
  ratingRequestId?: unknown;
}

const COMMENT_MAX = 500;

function asScore(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isInteger(v)) return null;
  if (v < 1 || v > 5) return null;
  return v;
}

function asComment(
  v: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== "string") return { ok: false, error: "comment must be a string" };
  const trimmed = v.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > COMMENT_MAX) {
    return { ok: false, error: `comment must be ≤${COMMENT_MAX} characters` };
  }
  return { ok: true, value: trimmed };
}

export async function POST(req: Request) {
  return handle(async () => {
    const session = await requireSession();
    if (session.user.role !== Role.RATER) {
      return Response.json({ error: "Only Raters can submit ratings" }, { status: 403 });
    }

    let body: SubmitBody;
    try {
      body = (await req.json()) as SubmitBody;
    } catch {
      return badReq("Invalid JSON body");
    }

    const repUserId = typeof body.repUserId === "string" ? body.repUserId : null;
    const ratingRequestId = typeof body.ratingRequestId === "string" ? body.ratingRequestId : null;

    const commentRes = asComment(body.comment);
    if (!commentRes.ok) return badReq(commentRes.error);
    const comment = commentRes.value;

    if (!repUserId) return badReq("repUserId required");
    if (!Array.isArray(body.answers) || body.answers.length === 0) {
      return badReq("answers (non-empty array) required");
    }

    // Validate each answer entry.
    const submitted = new Map<string, number>();
    for (const raw of body.answers as AnswerInput[]) {
      if (!raw || typeof raw !== "object") return badReq("answer entries must be objects");
      const key = typeof raw.questionKey === "string" ? raw.questionKey : null;
      const score = asScore(raw.score);
      if (!key) return badReq("answer.questionKey required");
      if (score === null) return badReq(`answer.score for ${key} must be an integer 1-5`);
      if (submitted.has(key)) return badReq(`duplicate answer for question ${key}`);
      submitted.set(key, score);
    }

    // Verify rep exists + has an industry + question set, and load the
    // questions in one query.
    const rep = await prisma.user.findUnique({
      where: { id: repUserId },
      select: {
        id: true,
        role: true,
        repProfile: {
          select: {
            industry: {
              select: {
                slug: true,
                questionSet: {
                  select: {
                    id: true,
                    slug: true,
                    questions: {
                      orderBy: { ord: "asc" },
                      select: { id: true, key: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!rep || rep.role !== Role.REP || !rep.repProfile) {
      return Response.json({ error: "Target rep not found" }, { status: 404 });
    }
    const set = rep.repProfile.industry.questionSet;
    if (!set || set.questions.length === 0) {
      return Response.json(
        { error: "This rep's industry has no question set configured" },
        { status: 409 },
      );
    }

    // Check coverage — every question in the set MUST have an answer.
    const expectedKeys = new Set(set.questions.map((q) => q.key));
    const missing: string[] = [];
    for (const key of expectedKeys) {
      if (!submitted.has(key)) missing.push(key);
    }
    if (missing.length > 0) {
      return badReq(`missing answers for: ${missing.join(", ")}`);
    }
    // Reject any extra (unknown) keys.
    for (const key of submitted.keys()) {
      if (!expectedKeys.has(key)) {
        return badReq(`unknown question key: ${key}`);
      }
    }

    const conn = await prisma.connection.findUnique({
      where: {
        repUserId_raterUserId: { repUserId, raterUserId: session.user.id },
      },
    });
    if (!conn) {
      return Response.json(
        { error: "No connection with this rep — request a connection first" },
        { status: 403 },
      );
    }
    if (conn.status !== ConnectionStatus.ACCEPTED) {
      return Response.json(
        { error: `Connection must be ACCEPTED before rating (current: ${conn.status})` },
        { status: 403 },
      );
    }

    // If a ratingRequestId is supplied, validate it lines up with this
    // (rep, rater) pair before we let it tag the rating.
    let validatedRequestId: string | null = null;
    if (ratingRequestId) {
      const rr = await prisma.ratingRequest.findUnique({
        where: { id: ratingRequestId },
      });
      if (!rr) return badReq("ratingRequest not found");
      if (rr.forRepUserId !== repUserId) return badReq("ratingRequest is for a different rep");
      if (rr.toRaterUserId && rr.toRaterUserId !== session.user.id) {
        return badReq("ratingRequest is for a different rater");
      }
      if (rr.status !== RatingRequestStatus.PENDING) {
        return badReq(`ratingRequest is ${rr.status}`);
      }
      if (rr.expiresAt.getTime() < Date.now()) {
        return badReq("ratingRequest is expired");
      }
      validatedRequestId = rr.id;
    }

    // Create rating + answers + (optionally) flip the request, atomically.
    const rating = await prisma.$transaction(async (tx) => {
      const created = await tx.rating.create({
        data: {
          connectionId: conn.id,
          repUserId,
          raterUserId: session.user.id,
          ratingRequestId: validatedRequestId,
          comment,
          answers: {
            create: set.questions.map((q) => ({
              questionId: q.id,
              score: submitted.get(q.key)!,
            })),
          },
        },
      });
      if (validatedRequestId) {
        await tx.ratingRequest.update({
          where: { id: validatedRequestId },
          data: {
            status: RatingRequestStatus.COMPLETED,
            completedAt: new Date(),
            toRaterUserId: session.user.id,
          },
        });
      }
      return created;
    });

    // Fan out to anyone who's favorited this rep. Fire-and-forget.
    let scoreSum = 0;
    for (const s of submitted.values()) scoreSum += s;
    const overall = scoreSum / submitted.size;
    void notifyFavoritesOfRating({
      ratingId: rating.id,
      repUserId,
      overall: Math.round(overall * 10) / 10,
    });

    return Response.json({ rating });
  });
}

function badReq(msg: string): Response {
  return Response.json({ error: msg }, { status: 400 });
}
