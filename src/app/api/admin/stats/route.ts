// GET /api/admin/stats — ADMIN-only platform stats.
//
// Returns counts: total users, by role, total connections, total ratings,
// rating-request status counts. Cheap to compute since they're all
// straight COUNTs.

import { Role, RatingRequestStatus } from "@prisma/client";

import { handle } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  return handle(async () => {
    await requireRole("ADMIN");

    const [
      totalUsers,
      byRole,
      totalConnections,
      totalRatings,
      ratingRequestsByStatus,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
      prisma.connection.count(),
      prisma.rating.count(),
      prisma.ratingRequest.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
    ]);

    const usersByRole: Record<string, number> = {};
    for (const r of Object.values(Role)) usersByRole[r] = 0;
    for (const row of byRole) usersByRole[row.role] = row._count._all;

    const requestsByStatus: Record<string, number> = {};
    for (const s of Object.values(RatingRequestStatus)) requestsByStatus[s] = 0;
    for (const row of ratingRequestsByStatus) {
      requestsByStatus[row.status] = row._count._all;
    }

    return {
      totalUsers,
      usersByRole,
      totalConnections,
      totalRatings,
      ratingRequestsByStatus: requestsByStatus,
    };
  });
}
