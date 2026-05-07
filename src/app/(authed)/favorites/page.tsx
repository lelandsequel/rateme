// /favorites — RATER only. Lists favorited reps with their current
// status badge + overall score. Only Raters get notifications when a
// favorited Rep gets rated; managers and other roles see a nudge.

import Link from "next/link";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aggregateRatings, type StatusTier } from "@/lib/aggregates";
import { FavoriteToggle } from "../reps/[id]/FavoriteToggle";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<StatusTier, string> = {
  Unverified: "bg-[#e2e8f0] text-[#475569]",
  Verified: "bg-[#e2e8f0] text-[#334155]",
  Trusted: "bg-[#e2e8f0] text-[#334155]",
  Preferred: "bg-[#e2e8f0] text-[#334155]",
  ELITE: "bg-[#e2e8f0] text-[#334155]",
  "ELITE+": "bg-[#dc2626] text-white",
};

export default async function FavoritesPage() {
  const session = await auth();
  if (session?.user?.role !== Role.RATER) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Favorites are for Raters</h1>
        <p className="text-[#475569]">
          Raters can favorite reps to get notified whenever they receive a new rating.
        </p>
      </div>
    );
  }

  const favorites = await prisma.favorite.findMany({
    where: { raterUserId: session.user.id! },
    orderBy: { createdAt: "desc" },
    include: {
      rep: {
        include: {
          repProfile: {
            include: { industry: { select: { slug: true, name: true } } },
          },
          ratingsReceived: {
            select: {
              responsiveness: true,
              productKnowledge: true,
              followThrough: true,
              listeningNeedsFit: true,
              trustIntegrity: true,
              takeCallAgain: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });

  const rows = favorites
    .filter((f) => f.rep.repProfile)
    .map((f) => ({
      favoriteId: f.id,
      createdAt: f.createdAt,
      rep: f.rep,
      agg: aggregateRatings(f.rep.ratingsReceived, f.rep.avatarUrl),
    }));

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wider text-[#94a3b8]">Your watchlist</p>
        <h1 className="text-3xl font-bold mt-1">Favorites</h1>
        <p className="text-[#475569]">
          You&apos;ll get a notification whenever any of these reps receives a new rating.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="bg-[#ffffff] rounded-lg border border-[#e5e7eb] p-6">
          <p className="text-[#475569]">No favorites yet.</p>
          <p className="text-sm text-[#94a3b8] mt-1">
            Tap the heart on a{" "}
            <Link href="/reps" className="underline hover:text-[#0f172a]">rep&apos;s profile</Link>{" "}
            to add them to your watchlist.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map(({ favoriteId, rep, agg }) => (
            <li
              key={favoriteId}
              className="bg-[#ffffff] rounded-lg border border-[#e5e7eb] p-4 flex items-start justify-between gap-3"
            >
              <Link href={`/reps/${rep.id}`} className="block flex-1 hover:opacity-80">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-[#0f172a]">{rep.name}</div>
                    <div className="text-sm text-[#475569]">
                      {rep.repProfile!.title} · {rep.repProfile!.company}
                    </div>
                    <div className="text-xs text-[#94a3b8] mt-1">
                      {rep.repProfile!.industry.name} · {rep.repProfile!.metroArea ?? rep.state}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs ${STATUS_BADGE[agg.status]}`}>
                    {agg.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-[#94a3b8]">
                  <span>Overall: <span className="text-[#0f172a] font-medium">{agg.overall ?? "—"}</span></span>
                  <span>Total ratings: <span className="text-[#0f172a] font-medium">{agg.ratingCount}</span></span>
                </div>
              </Link>
              <FavoriteToggle repUserId={rep.id} initialFavorited={true} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
