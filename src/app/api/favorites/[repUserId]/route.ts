// DELETE /api/favorites/:repUserId — RATER only. Idempotent: 200 even if
// the favorite did not exist, so the UI can fire-and-forget without first
// re-checking server state.

import { Role } from "@prisma/client";

import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ repUserId: string }> },
) {
  return handle(async () => {
    const session = await requireSession();
    if (session.user.role !== Role.RATER) {
      return Response.json(
        { error: "Only Raters can unfavorite reps" },
        { status: 403 },
      );
    }
    const { repUserId } = await ctx.params;

    // deleteMany is idempotent (count=0 if not found, no throw).
    const result = await prisma.favorite.deleteMany({
      where: { raterUserId: session.user.id, repUserId },
    });
    return { ok: true, removed: result.count };
  });
}
