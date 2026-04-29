import { handle, isValidId } from "@/lib/api";
import { requireTenant } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HAS_DB } from "@/lib/env";

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (!isValidId(id)) {
      return Response.json({ error: "Invalid alert id" }, { status: 400 });
    }

    if (!HAS_DB) {
      return Response.json(
        { error: "Acknowledge requires DATABASE_URL — currently in mock mode." },
        { status: 503 },
      );
    }

    const tenantId = await requireTenant();
    // Tenant-scope the update so cross-tenant ids 404 instead of mutating.
    const existing = await prisma.aLERT.findFirst({
      where: { id, tenantId },
    });
    if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.aLERT.update({
      where: { id },
      data: { acknowledged: true },
    });
    return { alert: updated };
  });
}
