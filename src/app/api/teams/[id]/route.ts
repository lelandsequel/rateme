import { handle, isValidId } from "@/lib/api";
import { requireTenant } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HAS_DB } from "@/lib/env";
import { mockTeams } from "@/lib/mock";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (!isValidId(id)) {
      return Response.json({ error: "Invalid team id" }, { status: 400 });
    }

    if (!HAS_DB) {
      const team = mockTeams.find((t) => t.id === id);
      if (!team) return Response.json({ error: "Not found" }, { status: 404 });
      return { team };
    }

    const tenantId = await requireTenant();
    const team = await prisma.tEAM.findFirst({
      where: { id, tenantId },
      include: {
        reps: {
          include: {
            scores: { orderBy: { calculatedAt: "desc" }, take: 1 },
          },
        },
      },
    });
    if (!team) return Response.json({ error: "Not found" }, { status: 404 });
    return { team };
  });
}
