// Public rep profile page — logged-out preview at /public/reps/[id].
//
// RMR ethos: data is portable, your reputation is yours. A rep should
// have a shareable public URL anyone can hit without an account.
//
// IMPORTANT: This route lives at the literal /public/... path (NOT a
// route group) so it does not collide with the authed /reps/[id] page.
// No auth check, direct Prisma queries, rater identity always REDACTED.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { aggregateRatings, type StatusTier } from "@/lib/aggregates";
import { Role } from "@prisma/client";
import { publicRater } from "@/lib/redact";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<StatusTier, string> = {
  Unverified: "bg-[#2d2d3a] text-[#9da4c1]",
  Verified: "bg-[#2d3449] text-[#c6c5d4]",
  Trusted: "bg-[#0f3a2a] text-[#7adfaf]",
  Preferred: "bg-[#1d3a5e] text-[#7ab3f5]",
  ELITE: "bg-[#3a2d1d] text-[#f5c97a]",
  "ELITE+": "bg-[#3a1d1d] text-[#f5867a]",
};

export default async function PublicRepProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const rep = await prisma.user.findUnique({
    where: { id },
    include: {
      repProfile: {
        include: { industry: { select: { slug: true, name: true } } },
      },
      ratingsReceived: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          rater: {
            include: {
              raterProfile: {
                include: { industry: { select: { slug: true, name: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!rep || rep.role !== Role.REP || !rep.repProfile) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-24">
        <h1 className="text-2xl font-bold">Rep not found</h1>
        <p className="mt-4 text-[#9da4c1]">
          This profile does not exist or is not public.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block underline text-[#bbc3ff]"
        >
          Sign in to RateMyRep
        </Link>
      </main>
    );
  }

  // Aggregates use ALL ratings — pull total set for the count + averages.
  // We only DISPLAY the latest 5 above, but the aggregate stats reflect
  // the full corpus.
  const allRatings = await prisma.rating.findMany({
    where: { repUserId: rep.id },
    select: {
      responsiveness: true,
      productKnowledge: true,
      followThrough: true,
      listeningNeedsFit: true,
      trustIntegrity: true,
      takeCallAgain: true,
      createdAt: true,
    },
  });
  const agg = aggregateRatings(allRatings, rep.avatarUrl);

  const callbackUrl = `/reps/${rep.id}`;

  return (
    <main className="min-h-screen bg-[#0b1326] text-[#dae2fd]">
      <div className="mx-auto max-w-3xl px-6 py-12 space-y-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-[#001d92] flex items-center justify-center">
              <span className="text-[#bbc3ff] text-sm font-bold">R</span>
            </div>
            <span className="font-bold tracking-tight">RateMyRep</span>
          </Link>
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="text-sm text-[#bbc3ff] underline hover:text-[#dae2fd]"
          >
            Sign in to connect
          </Link>
        </div>

        <header className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-[#9da4c1]">
              Public rep profile
            </p>
            <h1 className="text-3xl font-bold mt-1">{rep.name}</h1>
            <p className="text-[#c6c5d4]">
              {rep.repProfile.title} · {rep.repProfile.company} ·{" "}
              {rep.repProfile.industry.name}
            </p>
            <p className="text-xs text-[#9da4c1] mt-1">
              {rep.repProfile.metroArea ?? rep.state}
            </p>
          </div>
          <span className={`px-3 py-1 rounded ${STATUS_BADGE[agg.status]}`}>
            {agg.status}
          </span>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Total ratings" value={agg.ratingCount} />
          <Stat label="Overall" value={agg.overall ?? "—"} />
          <Stat
            label="Take call again?"
            value={
              agg.takeCallAgainPct === null ? "—" : `${agg.takeCallAgainPct}%`
            }
          />
        </div>

        {agg.averages && (
          <div className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
            <h2 className="font-bold mb-4">Dimensions</h2>
            <div className="space-y-2">
              <Bar label="Responsiveness" value={agg.averages.responsiveness} />
              <Bar
                label="Product knowledge"
                value={agg.averages.productKnowledge}
              />
              <Bar label="Follow-through" value={agg.averages.followThrough} />
              <Bar
                label="Listening / needs fit"
                value={agg.averages.listeningNeedsFit}
              />
              <Bar label="Trust / integrity" value={agg.averages.trustIntegrity} />
            </div>
          </div>
        )}

        <div>
          <h2 className="font-bold mb-3">Recent ratings</h2>
          {rep.ratingsReceived.length === 0 ? (
            <p className="text-[#9da4c1]">No ratings yet.</p>
          ) : (
            <ul className="space-y-2">
              {rep.ratingsReceived.map((r) => {
                const pr = r.rater.raterProfile
                  ? publicRater({
                      userId: r.rater.id,
                      user: r.rater,
                      title: r.rater.raterProfile.title,
                      company: r.rater.raterProfile.company,
                      industry: r.rater.raterProfile.industry,
                    })
                  : null;
                return (
                  <li
                    key={r.id}
                    className="bg-[#131b2e] rounded-lg border border-[#171f33]/50 p-4 flex items-start justify-between"
                  >
                    <div>
                      <div className="text-sm text-[#dae2fd]">
                        {pr?.title ?? "?"} · {pr?.company ?? "?"}
                      </div>
                      <div className="text-xs text-[#9da4c1] mt-1">
                        {new Date(r.createdAt).toLocaleDateString()} ·{" "}
                        {pr?.industry.name ?? "?"}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span title="Responsiveness">R {r.responsiveness}</span>
                      <span title="Product knowledge">
                        PK {r.productKnowledge}
                      </span>
                      <span title="Follow-through">FT {r.followThrough}</span>
                      <span title="Listening / needs">
                        LN {r.listeningNeedsFit}
                      </span>
                      <span title="Trust / integrity">TR {r.trustIntegrity}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] ${
                          r.takeCallAgain
                            ? "bg-[#0f3a2a] text-[#7adfaf]"
                            : "bg-[#3a1d1d] text-[#f5867a]"
                        }`}
                      >
                        {r.takeCallAgain ? "✓ would take call" : "✗ would not"}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-[#171f33]/50 pt-6">
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="inline-block px-4 py-2 rounded-lg bg-[#bbc3ff] text-[#0b1326] font-medium text-sm hover:bg-[#bbc3ff]/80"
          >
            Sign in to connect
          </Link>
        </div>
      </div>
    </main>
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

function Bar({ label, value }: { label: string; value: number }) {
  const pct = (value / 5) * 100;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-[#c6c5d4]">{label}</span>
        <span className="text-[#dae2fd] font-medium">{value.toFixed(1)}</span>
      </div>
      <div className="h-2 rounded-full bg-[#0b1326] overflow-hidden">
        <div
          className="h-full bg-[#bbc3ff]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
