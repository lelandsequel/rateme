// Rep detail page — public profile + aggregates + recent ratings (redacted).

import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aggregateRatings, type StatusTier } from "@/lib/aggregates";
import { ConnectionStatus, Role } from "@prisma/client";
import { ConnectButton } from "./ConnectButton";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<StatusTier, string> = {
  Unverified: "bg-[#2d2d3a] text-[#9da4c1]",
  Verified: "bg-[#2d3449] text-[#c6c5d4]",
  Trusted: "bg-[#0f3a2a] text-[#7adfaf]",
  Preferred: "bg-[#1d3a5e] text-[#7ab3f5]",
  ELITE: "bg-[#3a2d1d] text-[#f5c97a]",
  "ELITE+": "bg-[#3a1d1d] text-[#f5867a]",
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
  if (session?.user?.role === Role.RATER && session.user.id) {
    const conn = await prisma.connection.findUnique({
      where: {
        repUserId_raterUserId: { repUserId: rep.id, raterUserId: session.user.id },
      },
    });
    connectionStatus = conn?.status ?? null;
    connectionId = conn?.id ?? null;
  }

  const viewerIsRater = session?.user?.role === Role.RATER;
  const canRate = viewerIsRater && connectionStatus === ConnectionStatus.ACCEPTED;

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-[#9da4c1]">Rep profile</p>
          <h1 className="text-3xl font-bold mt-1">{rep.name}</h1>
          <p className="text-[#c6c5d4]">
            {rep.repProfile.title} · {rep.repProfile.company} · {rep.repProfile.industry.name}
          </p>
          <p className="text-xs text-[#9da4c1] mt-1">{rep.repProfile.metroArea ?? rep.state}</p>
          {salesManager && (
            <p className="text-xs text-[#9da4c1] mt-1">
              Manager: {salesManager.name}
              {salesManager.managerProfile?.company ? ` · ${salesManager.managerProfile.company}` : ""}
            </p>
          )}
        </div>
        <span className={`px-3 py-1 rounded ${STATUS_BADGE[agg.status]}`}>{agg.status}</span>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Ratings (year)" value={agg.ratingsThisYear} />
        <Stat label="Total ratings" value={agg.ratingCount} />
        <Stat label="Overall" value={agg.overall ?? "—"} />
        <Stat label="Take call again?" value={agg.takeCallAgainPct === null ? "—" : `${agg.takeCallAgainPct}%`} />
      </div>

      {agg.averages && (
        <div className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
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
            <Link href={`/reps/${rep.id}/rate`} className="px-4 py-2 rounded-lg bg-[#bbc3ff] text-[#0b1326] font-medium text-sm hover:bg-[#bbc3ff]/80">
              Rate this rep
            </Link>
          )}
          {!connectionStatus && (
            <ConnectButton repUserId={rep.id} />
          )}
          {connectionStatus === ConnectionStatus.PENDING && (
            <span className="px-4 py-2 rounded-lg bg-[#3a2d1d] text-[#f5c97a] text-sm">Connection pending</span>
          )}
          {connectionStatus === ConnectionStatus.REJECTED && (
            <span className="px-4 py-2 rounded-lg bg-[#3a1d1d] text-[#f5867a] text-sm">Connection rejected</span>
          )}
          {connectionStatus === ConnectionStatus.DISCONNECTED && (
            <ConnectButton repUserId={rep.id} label="Reconnect" />
          )}
          {connectionId && connectionStatus === ConnectionStatus.ACCEPTED && (
            <Link href="/connections" className="px-4 py-2 rounded-lg bg-[#131b2e] border border-[#2d3449] text-sm">
              Manage connection
            </Link>
          )}
        </div>
      )}

      <div>
        <h2 className="font-bold mb-3">Recent ratings</h2>
        {rep.ratingsReceived.length === 0 ? (
          <p className="text-[#9da4c1]">No ratings yet.</p>
        ) : (
          <ul className="space-y-2">
            {rep.ratingsReceived.slice(0, 10).map((r) => (
              <li key={r.id} className="bg-[#131b2e] rounded-lg border border-[#171f33]/50 p-4 flex items-start justify-between">
                <div>
                  <div className="text-sm text-[#dae2fd]">
                    {r.rater.raterProfile?.title ?? "?"} · {r.rater.raterProfile?.company ?? "?"}
                  </div>
                  <div className="text-xs text-[#9da4c1] mt-1">
                    {new Date(r.createdAt).toLocaleDateString()} · {r.rater.raterProfile?.industry.name ?? "?"}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span title="Responsiveness">R {r.responsiveness}</span>
                  <span title="Product knowledge">PK {r.productKnowledge}</span>
                  <span title="Follow-through">FT {r.followThrough}</span>
                  <span title="Listening / needs">LN {r.listeningNeedsFit}</span>
                  <span title="Trust / integrity">TR {r.trustIntegrity}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] ${r.takeCallAgain ? "bg-[#0f3a2a] text-[#7adfaf]" : "bg-[#3a1d1d] text-[#f5867a]"}`}>
                    {r.takeCallAgain ? "✓ would take call" : "✗ would not"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-[#131b2e] rounded-lg border border-[#171f33]/50 p-4">
      <div className="text-xs uppercase tracking-wider text-[#9da4c1]">{label}</div>
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
        <div className="h-full bg-[#bbc3ff]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
