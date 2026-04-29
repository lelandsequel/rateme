import { handle } from "@/lib/api";
import { requireTenant } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HAS_DB } from "@/lib/env";
import { mockReps } from "@/lib/mock";

type Band = "thriving" | "steady" | "watch" | "at-risk";
function bandFor(score: number): Band {
  if (score >= 90) return "thriving";
  if (score >= 75) return "steady";
  if (score >= 60) return "watch";
  return "at-risk";
}

interface RepRow {
  id: string;
  name: string;
  scores: Array<{ score: number }>;
}

function summarize(reps: RepRow[]) {
  const total = reps.length;
  const scores = reps.map((r) => r.scores[0]?.score ?? 0);
  const avg = total ? scores.reduce((a, b) => a + b, 0) / total : 0;

  const byBand: Record<Band, number> = {
    thriving: 0,
    steady: 0,
    watch: 0,
    "at-risk": 0,
  };
  for (const s of scores) byBand[bandFor(s)]++;

  const ranked = [...reps].sort(
    (a, b) => (b.scores[0]?.score ?? 0) - (a.scores[0]?.score ?? 0),
  );
  const top5 = ranked.slice(0, 5).map((r) => ({
    id: r.id,
    name: r.name,
    score: r.scores[0]?.score ?? 0,
  }));
  const bottom5 = ranked
    .slice(-5)
    .reverse()
    .map((r) => ({ id: r.id, name: r.name, score: r.scores[0]?.score ?? 0 }));

  return {
    totalReps: total,
    avgScore: Math.round(avg * 10) / 10,
    countByBand: byBand,
    top5,
    bottom5,
  };
}

export async function GET() {
  return handle(async () => {
    if (!HAS_DB) {
      return summarize(mockReps as unknown as RepRow[]);
    }

    const tenantId = await requireTenant();
    const reps = await prisma.rEP.findMany({
      where: { tenantId, status: "ACTIVE" },
      include: {
        scores: { orderBy: { calculatedAt: "desc" }, take: 1 },
      },
    });
    return summarize(reps as unknown as RepRow[]);
  });
}
