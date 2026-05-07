// /admin — ADMIN-only landing page with platform stats + nav to users.

import Link from "next/link";
import { Role, RatingRequestStatus } from "@prisma/client";

import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminLandingPage() {
  // requireRole throws a 403 Response if not ADMIN — which would
  // propagate as a thrown Response in a server component. Wrap with
  // Next's error boundary semantics by letting it bubble; the gate also
  // re-runs in the (authed) layout's auth() call so non-admins are
  // already past the login check.
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

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-wider text-[#9da4c1]">
          Admin
        </p>
        <h1 className="text-3xl font-bold mt-1">Platform stats</h1>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total users" value={totalUsers} />
        <Stat label="Connections" value={totalConnections} />
        <Stat label="Ratings" value={totalRatings} />
        <Stat
          label="Pending requests"
          value={requestsByStatus[RatingRequestStatus.PENDING] ?? 0}
        />
      </div>

      <div className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
        <h2 className="font-bold mb-4">Users by role</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          {Object.values(Role).map((role) => (
            <div
              key={role}
              className="bg-[#0b1326] rounded-lg p-3 border border-[#171f33]/30"
            >
              <div className="text-xs uppercase tracking-wider text-[#9da4c1]">
                {role}
              </div>
              <div className="text-xl font-bold mt-1">
                {usersByRole[role] ?? 0}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
        <h2 className="font-bold mb-4">Rating requests</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {Object.values(RatingRequestStatus).map((s) => (
            <div
              key={s}
              className="bg-[#0b1326] rounded-lg p-3 border border-[#171f33]/30"
            >
              <div className="text-xs uppercase tracking-wider text-[#9da4c1]">
                {s}
              </div>
              <div className="text-xl font-bold mt-1">
                {requestsByStatus[s] ?? 0}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Link
          href="/admin/users"
          className="inline-block px-4 py-2 rounded-lg bg-[#bbc3ff] text-[#0b1326] font-medium text-sm hover:bg-[#bbc3ff]/80"
        >
          Manage users
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-[#131b2e] rounded-lg border border-[#171f33]/50 p-4">
      <div className="text-xs uppercase tracking-wider text-[#9da4c1]">
        {label}
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
