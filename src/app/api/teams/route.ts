import { handle } from "@/lib/api";
import { requireTenant } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HAS_DB } from "@/lib/env";
import { mockTeams } from "@/lib/mock";

export async function GET() {
  return handle(async () => {
    if (!HAS_DB) {
      return {
        teams: mockTeams.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          repCount: t.reps.length,
        })),
      };
    }

    const tenantId = await requireTenant();
    const teams = await prisma.tEAM.findMany({
      where: { tenantId },
      include: { _count: { select: { reps: true } } },
      orderBy: { name: "asc" },
    });

    return {
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        repCount: t._count.reps,
      })),
    };
  });
}
