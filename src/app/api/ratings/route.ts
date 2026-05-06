// POST /api/ratings — submit a rating from a Rater to a Rep.
//
// Hard requirements (per spec):
//   • Caller must be a RATER.
//   • Connection (caller, target rep) must exist with status ACCEPTED.
//   • All five 1-5 dimensions are required ints. NO free text.
//   • takeCallAgain is a required boolean.
//
// We do NOT enforce "one rating per pair" — repeat ratings are valuable
// signal (track sentiment over time). Per-pair rate-limiting can come
// later if it turns into spam.

import { ConnectionStatus, Role } from "@prisma/client";

import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface SubmitBody {
  repUserId?: unknown;
  responsiveness?: unknown;
  productKnowledge?: unknown;
  followThrough?: unknown;
  listeningNeedsFit?: unknown;
  trustIntegrity?: unknown;
  takeCallAgain?: unknown;
  ratingRequestId?: unknown;
}

function asDim(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isInteger(v)) return null;
  if (v < 1 || v > 5) return null;
  return v;
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
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const repUserId = typeof body.repUserId === "string" ? body.repUserId : null;
    const responsiveness    = asDim(body.responsiveness);
    const productKnowledge  = asDim(body.productKnowledge);
    const followThrough     = asDim(body.followThrough);
    const listeningNeedsFit = asDim(body.listeningNeedsFit);
    const trustIntegrity    = asDim(body.trustIntegrity);
    const takeCallAgain     = typeof body.takeCallAgain === "boolean" ? body.takeCallAgain : null;
    const ratingRequestId   = typeof body.ratingRequestId === "string" ? body.ratingRequestId : null;

    if (!repUserId) return badReq("repUserId required");
    if (responsiveness === null) return badReq("responsiveness must be an integer 1-5");
    if (productKnowledge === null) return badReq("productKnowledge must be an integer 1-5");
    if (followThrough === null) return badReq("followThrough must be an integer 1-5");
    if (listeningNeedsFit === null) return badReq("listeningNeedsFit must be an integer 1-5");
    if (trustIntegrity === null) return badReq("trustIntegrity must be an integer 1-5");
    if (takeCallAgain === null) return badReq("takeCallAgain (boolean) required");

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

    const rating = await prisma.rating.create({
      data: {
        connectionId: conn.id,
        repUserId,
        raterUserId: session.user.id,
        responsiveness,
        productKnowledge,
        followThrough,
        listeningNeedsFit,
        trustIntegrity,
        takeCallAgain,
        ratingRequestId,
      },
    });

    return Response.json({ rating });
  });
}

function badReq(msg: string): Response {
  return Response.json({ error: msg }, { status: 400 });
}
