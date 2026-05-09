// GET /api/industries — public lookup of the curated industry list.
//
// No auth required: signup forms and search filters need to populate
// industry pickers BEFORE the user has a session.

import { handle } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { HAS_DB } from "@/lib/env";
import { INDUSTRIES_V2 } from "@/lib/industries";

export async function GET() {
  return handle(async () => {
    if (!HAS_DB) {
      return { industries: INDUSTRIES_V2 };
    }
    const rows = await prisma.industry.findMany({
      orderBy: { name: "asc" },
      select: { slug: true, name: true },
    });
    return { industries: rows };
  });
}
