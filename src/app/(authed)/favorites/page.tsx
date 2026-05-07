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
  Unverified: "bg-[#2d2d3a] text-[#9da4c1]",
  Verified: "bg-[#2d3449] text-[#c6c5d4]",
  Trusted: "bg-[#0f3a2a] text-[#7adfaf]",
  Preferred: "bg-[#1d3a5e] text-[#7ab3f5]",
  ELITE: "bg-[#3a2d1d] text-[#f5c97a]",
  "ELITE+": "bg-[#3a1d1d] text-[#f5867a]",
};

export default async function FavoritesPage() {
  const session = await auth();
  if (session?.user?.role !== Role.RATER) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Favorites are for Raters</h1>
        <p className="text-[#c6c5d4]">
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
        <p className="text-xs uppercase tracking-wider text-[#9da4c1]">Your watchlist</p>
        <h1 className="text-3xl font-bold mt-1">Favorites</h1>
        <p className="text-[#c6c5d4]">
          You&apos;ll get a notification whenever any of these reps receives a new rating.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="bg-[#131b2e] rounded-lg border border-[#171f33]/50 p-6">
          <p className="text-[#c6c5d4]">No favorites yet.</p>
          <p className="text-sm text-[#9da4c1] mt-1">
            Tap the heart on a{" "}
            <Link href="/reps" className="underline hover:text-[#dae2fd]">rep&apos;s profile</Link>{" "}
            to add them to your watchlist.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map(({ favoriteId, rep, agg }) => (
            <li
              key={favoriteId}
              className="bg-[#131b2e] rounded-lg border border-[#171f33]/50 p-4 flex items-start justify-between gap-3"
            >
              <Link href={`/reps/${rep.id}`} className="block flex-1 hover:opacity-80">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-[#dae2fd]">{rep.name}</div>
                    <div className="text-sm text-[#c6c5d4]">
                      {rep.repProfile!.title} · {rep.repProfile!.company}
                    </div>
                    <div className="text-xs text-[#9da4c1] mt-1">
                      {rep.repProfile!.industry.name} · {rep.repProfile!.metroArea ?? rep.state}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs ${STATUS_BADGE[agg.status]}`}>
                    {agg.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-[#9da4c1]">
                  <span>Overall: <span className="text-[#dae2fd] font-medium">{agg.overall ?? "—"}</span></span>
                  <span>Total ratings: <span className="text-[#dae2fd] font-medium">{agg.ratingCount}</span></span>
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
