import { handle } from "@/lib/api";
import { requireTenant } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HAS_DB } from "@/lib/env";
import { mockBenchmarks } from "@/lib/mock";

export async function GET() {
  return handle(async () => {
    if (!HAS_DB) {
      return { benchmarks: mockBenchmarks };
    }
    const tenantId = await requireTenant();
    const benchmarks = await prisma.bENCHMARK.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    });
    return { benchmarks };
  });
}
