import { handle, isValidId } from "@/lib/api";
import { requireTenant } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HAS_DB } from "@/lib/env";
import { mockReps } from "@/lib/mock";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (!isValidId(id)) {
      return Response.json({ error: "Invalid rep id" }, { status: 400 });
    }

    if (!HAS_DB) {
      const rep = mockReps.find((r) => r.id === id);
      if (!rep) return Response.json({ error: "Not found" }, { status: 404 });
      return {
        rep,
        scoreHistory: rep.scores.slice(0, 12),
        sessions: rep.sessions.slice(0, 10),
      };
    }

    const tenantId = await requireTenant();
    const rep = await prisma.rEP.findFirst({
      where: { id, tenantId },
      include: {
        team: true,
        scores: { orderBy: { calculatedAt: "desc" }, take: 12 },
        sessions: { orderBy: { startedAt: "desc" }, take: 10 },
      },
    });
    if (!rep) return Response.json({ error: "Not found" }, { status: 404 });

    return {
      rep,
      scoreHistory: rep.scores,
      sessions: rep.sessions,
    };
  });
}
