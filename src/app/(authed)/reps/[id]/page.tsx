// Rep detail page — public profile + aggregates + recent ratings (redacted).

import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aggregateRatings, type StatusTier } from "@/lib/aggregates";
import { ConnectionStatus, Role } from "@prisma/client";
import { ConnectButton } from "./ConnectButton";
import { OnBehalfRequest, type RaterOption } from "./OnBehalfRequest";
import { FavoriteToggle } from "./FavoriteToggle";
import { PublicLinkButton } from "./PublicLinkButton";
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

export default async function RepDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const rep = await prisma.user.findUnique({
    where: { id },
    include: {
      repProfile: { include: { industry: { select: { slug: true, name: true } } } },
      ratingsReceived: {
        orderBy: { createdAt: "desc" },
        include: {
          rater: {
            include: {
              raterProfile: { include: { industry: { select: { slug: true, name: true } } } },
            },
          },
        },
      },
    },
  });

  if (!rep || rep.role !== Role.REP || !rep.repProfile) {
    return <div><h1 className="text-2xl font-bold">Rep not found</h1></div>;
  }

  const agg = aggregateRatings(rep.ratingsReceived, rep.avatarUrl);

  // Per spec, surface only the rep's Sales Manager (REP_MANAGER) on the profile.
  const membership = await prisma.teamMembership.findFirst({
    where: { memberId: rep.id, endedAt: null, acceptedAt: { not: null } },
    select: {
      manager: {
        select: {
          id: true,
          name: true,
          managerProfile: { select: { company: true, managesType: true } },
        },
      },
    },
  });
  const salesManager =
    membership?.manager?.managerProfile?.managesType === "REP_MANAGER"
      ? membership.manager
      : null;

  // Connection check (only relevant for RATER viewers).
  let connectionStatus: ConnectionStatus | null = null;
  let connectionId: string | null = null;
  let favorited = false;
  if (session?.user?.role === Role.RATER && session.user.id) {
    const [conn, fav] = await Promise.all([
      prisma.connection.findUnique({
        where: {
          repUserId_raterUserId: { repUserId: rep.id, raterUserId: session.user.id },
        },
      }),
      prisma.favorite.findUnique({
        where: {
          raterUserId_repUserId: { raterUserId: session.user.id, repUserId: rep.id },
        },
      }),
    ]);
    connectionStatus = conn?.status ?? null;
    connectionId = conn?.id ?? null;
    favorited = !!fav;
  }

  const viewerIsRater = session?.user?.role === Role.RATER;
  const viewerIsSelf = session?.user?.id === rep.id;
  const canRate = viewerIsRater && connectionStatus === ConnectionStatus.ACCEPTED;

  // Sales-manager-on-team gate for the on-behalf request UI.
  let canRequestOnBehalf = false;
  let acceptedRaterOptions: RaterOption[] = [];
  if (
    session?.user?.role === Role.SALES_MANAGER &&
    session.user.id
  ) {
    const membership = await prisma.teamMembership.findFirst({
      where: {
        managerId: session.user.id,
        memberId: rep.id,
        acceptedAt: { not: null },
        endedAt: null,
      },
    });
    if (membership) {
      canRequestOnBehalf = true;
      const accepted = await prisma.connection.findMany({
        where: { repUserId: rep.id, status: ConnectionStatus.ACCEPTED },
        include: {
          rater: {
            include: {
              raterProfile: {
                include: { industry: { select: { slug: true, name: true } } },
              },
            },
          },
        },
      });
      acceptedRaterOptions = accepted
        .filter((c) => c.rater.raterProfile)
        .map((c) => {
          const pr = publicRater({
            userId: c.rater.id,
            user: c.rater,
            title: c.rater.raterProfile!.title,
            company: c.rater.raterProfile!.company,
            industry: c.rater.raterProfile!.industry,
          });
          return {
            userId: pr.userId,
            title: pr.title,
            company: pr.company,
            industry: pr.industry.name,
          };
        });
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-[#94a3b8]">Rep profile</p>
          <h1 className="text-3xl font-bold mt-1">{rep.name}</h1>
          <p className="text-[#475569]">
            {rep.repProfile.title} · {rep.repProfile.company} · {rep.repProfile.industry.name}
          </p>
          <p className="text-xs text-[#94a3b8] mt-1">{rep.repProfile.metroArea ?? rep.state}</p>
          {salesManager && (
            <p className="text-xs text-[#94a3b8] mt-1">
              Manager:{" "}
              {salesManager.id ? (
                <Link
                  href={`/managers/${salesManager.id}`}
                  className="underline hover:text-[#dc2626]"
                >
                  {salesManager.name}
                </Link>
              ) : (
                salesManager.name
              )}
              {salesManager.managerProfile?.company ? ` · ${salesManager.managerProfile.company}` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[agg.status]}`}>{agg.status}</span>
          {viewerIsRater && (
            <FavoriteToggle repUserId={rep.id} initialFavorited={favorited} />
          )}
          {viewerIsSelf && <PublicLinkButton repId={rep.id} />}
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
        <Stat label="Ratings (year)" value={agg.ratingsThisYear} />
        <Stat label="Take call again?" value={agg.takeCallAgainPct === null ? "—" : `${agg.takeCallAgainPct}%`} />
      </div>

      {agg.averages && (
        <div className="bg-[#ffffff] rounded-xl p-6 border border-[#e5e7eb]">
          <h2 className="font-bold mb-4">Dimensions</h2>
          <div className="space-y-2">
            <Bar label="Responsiveness" value={agg.averages.responsiveness} />
            <Bar label="Product knowledge" value={agg.averages.productKnowledge} />
            <Bar label="Follow-through" value={agg.averages.followThrough} />
            <Bar label="Listening / needs fit" value={agg.averages.listeningNeedsFit} />
            <Bar label="Trust / integrity" value={agg.averages.trustIntegrity} />
          </div>
        </div>
      )}

      {viewerIsRater && (
        <div className="flex gap-3">
          {canRate && (
            <Link href={`/reps/${rep.id}/rate`} className="px-4 py-2 rounded-lg bg-[#dc2626] text-[#ffffff] font-medium text-sm hover:bg-[#b91c1c]">
              Rate this rep
            </Link>
          )}
          {!connectionStatus && (
            <ConnectButton repUserId={rep.id} />
          )}
          {connectionStatus === ConnectionStatus.PENDING && (
            <span className="px-4 py-2 rounded-lg bg-[#fef3c7] text-[#92400e] text-sm">Connection pending</span>
          )}
          {connectionStatus === ConnectionStatus.REJECTED && (
            <span className="px-4 py-2 rounded-lg bg-[#fee2e2] text-[#991b1b] text-sm">Connection rejected</span>
          )}
          {connectionStatus === ConnectionStatus.DISCONNECTED && (
            <ConnectButton repUserId={rep.id} label="Reconnect" />
          )}
          {connectionId && connectionStatus === ConnectionStatus.ACCEPTED && (
            <Link href="/connections" className="px-4 py-2 rounded-lg bg-[#ffffff] border border-[#e5e7eb] text-sm">
              Manage connection
            </Link>
          )}
        </div>
      )}

      {canRequestOnBehalf && (
        <OnBehalfRequest forRepUserId={rep.id} raters={acceptedRaterOptions} />
      )}

      <div>
        <h2 className="font-bold mb-3">Recent ratings</h2>
        {rep.ratingsReceived.length === 0 ? (
          <p className="text-[#94a3b8]">No ratings yet.</p>
        ) : (
          <ul className="space-y-2">
            {rep.ratingsReceived.slice(0, 10).map((r) => {
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
                        {r.rater.name}
                        <span className="text-[#94a3b8] font-normal">
                          {" — "}
                          {r.rater.raterProfile?.title ?? "?"} ·{" "}
                          {r.rater.raterProfile?.company ?? "?"}
                        </span>
                      </div>
                      <div className="text-xs text-[#94a3b8] mt-1">
                        {new Date(r.createdAt).toLocaleDateString()} ·{" "}
                        {r.rater.raterProfile?.industry.name ?? "?"}
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
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-[#ffffff] rounded-lg border border-[#e5e7eb] p-4">
      <div className="text-xs uppercase tracking-wider text-[#94a3b8]">{label}</div>
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
        <div className="h-full bg-[#dc2626]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
