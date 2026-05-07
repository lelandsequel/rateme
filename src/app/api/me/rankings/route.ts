// GET /api/me/rankings — role-shaped rankings payload for the current user.

import { Role } from "@prisma/client";

import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  raterFulfillmentRate,
  raterIndustryRegionalRanking,
  repIndustryRegionalRanking,
  repTeamRanking,
} from "@/lib/rankings";

export async function GET() {
  return handle(async () => {
    const session = await requireSession();
    const userId = session.user.id;
    const role = session.user.role;

    if (role === Role.REP) {
      const [team, industryRegional] = await Promise.all([
        repTeamRanking(prisma, userId),
        repIndustryRegionalRanking(prisma, userId),
      ]);
      return { team, industryRegional };
    }

    if (role === Role.RATER) {
      const [industryRegional, fulfillment] = await Promise.all([
        raterIndustryRegionalRanking(prisma, userId),
        raterFulfillmentRate(prisma, userId),
      ]);
      return { industryRegional, fulfillment };
    }

    return Response.json(
      { error: "Rankings are only available for REP or RATER accounts" },
      { status: 400 },
    );
  });
}
