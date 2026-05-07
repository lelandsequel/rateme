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
  Unverified: "bg-[#e2e8f0] text-[#475569]",
  Verified: "bg-[#e2e8f0] text-[#334155]",
  Trusted: "bg-[#e2e8f0] text-[#334155]",
  Preferred: "bg-[#e2e8f0] text-[#334155]",
  ELITE: "bg-[#e2e8f0] text-[#334155]",
  "ELITE+": "bg-[#dc2626] text-white",
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
        <p className="mt-4 text-[#94a3b8]">
          This profile does not exist or is not public.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block underline text-[#dc2626]"
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
    <main className="min-h-screen bg-[#ffffff] text-[#0f172a]">
      <div className="mx-auto max-w-3xl px-6 py-12 space-y-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-[#dc2626] flex items-center justify-center">
              <span className="text-white text-sm font-bold">R</span>
            </div>
            <span className="font-bold tracking-tight">RateMyRep</span>
          </Link>
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="text-sm text-[#dc2626] underline hover:text-[#0f172a]"
          >
            Sign in to connect
          </Link>
        </div>

        <header className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-[#94a3b8]">
              Public rep profile
            </p>
            <h1 className="text-3xl font-bold mt-1">{rep.name}</h1>
            <p className="text-[#475569]">
              {rep.repProfile.title} · {rep.repProfile.company} ·{" "}
              {rep.repProfile.industry.name}
            </p>
            <p className="text-xs text-[#94a3b8] mt-1">
              {rep.repProfile.metroArea ?? rep.state}
            </p>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[agg.status]}`}>
            {agg.status}
          </span>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat
            label="Overall"
            value={
              <span>
                <span className="text-[#fbbf24] mr-1">★</span>
                {agg.overall ?? "—"}
              </span>
            }
          />
          <Stat label="Total ratings" value={agg.ratingCount} />
          <Stat
            label="Take call again?"
            value={
              agg.takeCallAgainPct === null ? "—" : `${agg.takeCallAgainPct}%`
            }
          />
        </div>

        {agg.averages && (
          <div className="bg-[#ffffff] rounded-xl p-6 border border-[#e5e7eb]">
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
            <p className="text-[#94a3b8]">No ratings yet.</p>
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
                const overall =
                  (r.responsiveness +
                    r.productKnowledge +
                    r.followThrough +
                    r.listeningNeedsFit +
                    r.trustIntegrity) /
                  5;
                return (
                  <li
                    key={r.id}
                    className="bg-white rounded-lg border border-[#e5e7eb] p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm text-[#0f172a] font-medium">
                          {pr?.name ?? "Anonymous"}
                          <span className="text-[#94a3b8] font-normal">
                            {" — "}
                            {pr?.title ?? "?"} · {pr?.company ?? "?"}
                          </span>
                        </div>
                        <div className="text-xs text-[#94a3b8] mt-1">
                          {new Date(r.createdAt).toLocaleDateString()} ·{" "}
                          {pr?.industry.name ?? "?"}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs whitespace-nowrap">
                        <span className="text-sm font-semibold text-[#0f172a]">
                          <span className="text-[#fbbf24] mr-0.5">★</span>
                          {overall.toFixed(1)}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            r.takeCallAgain
                              ? "bg-[#dcfce7] text-[#166534]"
                              : "bg-[#fee2e2] text-[#991b1b]"
                          }`}
                        >
                          {r.takeCallAgain ? "would take call" : "would not"}
                        </span>
                      </div>
                    </div>
                    {r.comment && (
                      <p className="text-sm text-[#475569] mt-2 italic">
                        “{r.comment}”
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-[11px] text-[#94a3b8] mt-2">
                      <span title="Responsiveness">R {r.responsiveness}</span>
                      <span title="Product knowledge">PK {r.productKnowledge}</span>
                      <span title="Follow-through">FT {r.followThrough}</span>
                      <span title="Listening / needs">LN {r.listeningNeedsFit}</span>
                      <span title="Trust / integrity">TR {r.trustIntegrity}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-[#e5e7eb] pt-6">
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="inline-block px-4 py-2 rounded-lg bg-[#dc2626] text-[#ffffff] font-medium text-sm hover:bg-[#b91c1c]"
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
    <div className="bg-[#ffffff] rounded-lg border border-[#e5e7eb] p-4">
      <div className="text-xs uppercase tracking-wider text-[#94a3b8]">
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
        <span className="text-[#475569]">{label}</span>
        <span className="text-[#0f172a] font-medium">{value.toFixed(1)}</span>
      </div>
      <div className="h-2 rounded-full bg-[#f1f5f9] overflow-hidden">
        <div
          className="h-full bg-[#dc2626]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
