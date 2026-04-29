import { handle, parseIntParam } from "@/lib/api";
import { requireTenant } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HAS_DB } from "@/lib/env";
import { mockReps } from "@/lib/mock";

const VALID_BANDS = new Set(["thriving", "steady", "watch", "at-risk"]);

function bandFor(score: number): "thriving" | "steady" | "watch" | "at-risk" {
  if (score >= 90) return "thriving";
  if (score >= 75) return "steady";
  if (score >= 60) return "watch";
  return "at-risk";
}

export async function GET(request: Request) {
  return handle(async () => {
    const url = new URL(request.url);
    const teamId = url.searchParams.get("teamId");
    const band = url.searchParams.get("band");
    const limit = parseIntParam(url.searchParams.get("limit"), 50, 1, 500);
    const offset = parseIntParam(url.searchParams.get("offset"), 0, 0, 100_000);

    if (band && !VALID_BANDS.has(band)) {
      return Response.json(
        { error: `Invalid band; expected one of ${[...VALID_BANDS].join(",")}` },
        { status: 400 },
      );
    }

    if (!HAS_DB) {
      // Mock mode: filter the bundled mock data so the page surface still works
      // without a DB. No tenant scoping here — mock has only one tenant.
      let reps = mockReps;
      if (teamId) reps = reps.filter((r) => r.teamId === teamId);
      if (band) reps = reps.filter((r) => bandFor(r.scores[0]?.score ?? 0) === band);
      const sliced = reps.slice(offset, offset + limit);
      return { reps: sliced, total: reps.length };
    }

    const tenantId = await requireTenant();

    const reps = await prisma.rEP.findMany({
      where: {
        tenantId,
        ...(teamId ? { teamId } : {}),
      },
      include: {
        scores: { orderBy: { calculatedAt: "desc" }, take: 1 },
        team: true,
      },
      orderBy: { name: "asc" },
      take: limit,
      skip: offset,
    });

    const filtered = band
      ? reps.filter((r) => bandFor(r.scores[0]?.score ?? 0) === band)
      : reps;

    return { reps: filtered, total: filtered.length };
  });
}
