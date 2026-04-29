import { handle, isValidId } from "@/lib/api";
import { requireTenant } from "@/lib/auth";
import { HAS_DB } from "@/lib/env";
import { recomputeRepScore } from "@/lib/scoring";

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (!isValidId(id)) {
      return Response.json({ error: "Invalid rep id" }, { status: 400 });
    }

    if (!HAS_DB) {
      return Response.json(
        { error: "Recompute requires DATABASE_URL — currently in mock mode." },
        { status: 503 },
      );
    }

    const tenantId = await requireTenant();
    const out = await recomputeRepScore(id, tenantId);
    if (!out) return Response.json({ error: "Not found" }, { status: 404 });
    return { score: out.row, breakdown: out.result };
  });
}
