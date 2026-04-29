import { handle } from "@/lib/api";
import { requireTenant } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HAS_DB } from "@/lib/env";
import { mockAlerts } from "@/lib/mock";

const VALID_SEVERITY = new Set(["INFO", "WARNING", "CRITICAL"]);

export async function GET(request: Request) {
  return handle(async () => {
    const url = new URL(request.url);
    const severity = url.searchParams.get("severity");
    const ackParam = url.searchParams.get("acknowledged");
    const acknowledged =
      ackParam === "true" ? true : ackParam === "false" ? false : undefined;

    if (severity && !VALID_SEVERITY.has(severity)) {
      return Response.json(
        { error: `Invalid severity; expected one of ${[...VALID_SEVERITY].join(",")}` },
        { status: 400 },
      );
    }

    if (!HAS_DB) {
      let alerts = mockAlerts;
      if (severity) alerts = alerts.filter((a) => a.severity === severity);
      if (acknowledged !== undefined)
        alerts = alerts.filter((a) => a.acknowledged === acknowledged);
      return { alerts };
    }

    const tenantId = await requireTenant();
    const alerts = await prisma.aLERT.findMany({
      where: {
        tenantId,
        ...(severity ? { severity } : {}),
        ...(acknowledged !== undefined ? { acknowledged } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return { alerts };
  });
}
