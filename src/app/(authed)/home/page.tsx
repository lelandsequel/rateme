// /home — role-conditional dashboard.
//
// REP            → my status, my recent ratings, CTA to invite raters
// RATER          → my pending connections, browse reps CTA
// SALES_MANAGER  → my team's status snapshot
// RATER_MANAGER  → my team's connection volume snapshot
// ADMIN          → admin landing (just stats for now)

import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aggregateRatings, type StatusTier } from "@/lib/aggregates";
import { ConnectionStatus, Role } from "@prisma/client";
import { InviteRater } from "./InviteRater";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<StatusTier, string> = {
  Verified: "bg-[#2d3449] text-[#c6c5d4]",
  Trusted: "bg-[#0f3a2a] text-[#7adfaf]",
  Preferred: "bg-[#1d3a5e] text-[#7ab3f5]",
  ELITE: "bg-[#3a2d1d] text-[#f5c97a]",
  "ELITE+": "bg-[#3a1d1d] text-[#f5867a]",
};

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) return null;
  const role = session.user.role ?? "REP";

  if (role === Role.REP) return <RepHome userId={session.user.id ?? ""} />;
  if (role === Role.RATER) return <RaterHome userId={session.user.id ?? ""} />;
  if (role === Role.SALES_MANAGER) return <SalesManagerHome userId={session.user.id ?? ""} />;
  if (role === Role.RATER_MANAGER) return <RaterManagerHome userId={session.user.id ?? ""} />;
  return <AdminHome />;
}

async function RepHome({ userId }: { userId: string }) {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      repProfile: { include: { industry: { select: { name: true } } } },
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
  });
  if (!me?.repProfile) return <p>Set up your rep profile to get started.</p>;

  const agg = aggregateRatings(me.ratingsReceived);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-wider text-[#9da4c1]">Your reputation</p>
        <h1 className="text-3xl font-bold mt-1">{me.name}</h1>
        <p className="text-[#c6c5d4]">{me.repProfile.title} · {me.repProfile.company} · {me.repProfile.industry.name}</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Status" value={<span className={`px-2 py-0.5 rounded ${STATUS_BADGE[agg.status]}`}>{agg.status}</span>} />
        <Stat label="Ratings (year)" value={agg.ratingsThisYear} />
        <Stat label="Overall score" value={agg.overall ?? "—"} />
        <Stat label="Take call again?" value={agg.takeCallAgainPct === null ? "—" : `${agg.takeCallAgainPct}%`} />
      </div>

      {agg.averages && (
        <div className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
          <h2 className="font-bold mb-4">Dimension averages</h2>
          <div className="space-y-2">
            <Bar label="Responsiveness" value={agg.averages.responsiveness} />
            <Bar label="Product knowledge" value={agg.averages.productKnowledge} />
            <Bar label="Follow-through" value={agg.averages.followThrough} />
            <Bar label="Listening / needs fit" value={agg.averages.listeningNeedsFit} />
            <Bar label="Trust / integrity" value={agg.averages.trustIntegrity} />
          </div>
        </div>
      )}

      <InviteRater />

      <div className="flex gap-3">
        <Link href="/connections" className={btnPrimary}>Manage connections</Link>
        <Link href="/raters" className={btnSecondary}>Browse raters</Link>
      </div>
    </div>
  );
}

async function RaterHome({ userId }: { userId: string }) {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      raterProfile: { include: { industry: { select: { name: true } } } },
      raterConnections: {
        where: { status: { in: [ConnectionStatus.PENDING, ConnectionStatus.ACCEPTED] } },
      },
      ratingsGiven: { select: { id: true } },
    },
  });
  if (!me?.raterProfile) return <p>Profile setup pending.</p>;

  const pendingCount = me.raterConnections.filter((c) => c.status === "PENDING").length;
  const acceptedCount = me.raterConnections.filter((c) => c.status === "ACCEPTED").length;

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-wider text-[#9da4c1]">Welcome back</p>
        <h1 className="text-3xl font-bold mt-1">{me.name}</h1>
        <p className="text-[#c6c5d4]">{me.raterProfile.title} · {me.raterProfile.company}</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Stat label="Active connections" value={acceptedCount} />
        <Stat label="Pending requests" value={pendingCount} />
        <Stat label="Ratings given" value={me.ratingsGiven.length} />
      </div>

      <div className="flex gap-3">
        <Link href="/reps" className={btnPrimary}>Browse reps to rate</Link>
        <Link href="/connections" className={btnSecondary}>My connections</Link>
      </div>
    </div>
  );
}

async function SalesManagerHome({ userId }: { userId: string }) {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      managerProfile: true,
      managedMemberships: {
        where: { endedAt: null },
        include: {
          member: {
            include: {
              repProfile: { include: { industry: { select: { name: true } } } },
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
      },
    },
  });
  if (!me?.managerProfile) return <p>Manager profile not set.</p>;

  const teamRows = me.managedMemberships
    .filter((m) => m.member.repProfile)
    .map((m) => {
      const agg = aggregateRatings(m.member.ratingsReceived);
      return {
        id: m.member.id,
        name: m.member.name,
        title: m.member.repProfile!.title,
        company: m.member.repProfile!.company,
        industry: m.member.repProfile!.industry.name,
        agg,
      };
    });

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-wider text-[#9da4c1]">Your team</p>
        <h1 className="text-3xl font-bold mt-1">{me.name}</h1>
        <p className="text-[#c6c5d4]">Sales Manager · {me.managerProfile.company}</p>
      </header>

      <div className="bg-[#131b2e] rounded-xl border border-[#171f33]/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#0b1326]">
            <tr className="text-left text-xs uppercase tracking-wider text-[#9da4c1]">
              <th className="px-4 py-3">Rep</th>
              <th className="px-4 py-3">Industry</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Ratings</th>
              <th className="px-4 py-3 text-right">Overall</th>
              <th className="px-4 py-3 text-right">Take call?</th>
            </tr>
          </thead>
          <tbody>
            {teamRows.map((r) => (
              <tr key={r.id} className="border-t border-[#171f33]/50 hover:bg-[#0b1326]/40">
                <td className="px-4 py-3">
                  <Link href={`/reps/${r.id}`} className="text-[#dae2fd] hover:text-[#bbc3ff]">
                    {r.name}
                  </Link>
                  <div className="text-xs text-[#9da4c1]">{r.title} · {r.company}</div>
                </td>
                <td className="px-4 py-3 text-[#c6c5d4]">{r.industry}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs ${STATUS_BADGE[r.agg.status]}`}>{r.agg.status}</span>
                </td>
                <td className="px-4 py-3 text-right">{r.agg.ratingCount}</td>
                <td className="px-4 py-3 text-right">{r.agg.overall ?? "—"}</td>
                <td className="px-4 py-3 text-right">{r.agg.takeCallAgainPct === null ? "—" : `${r.agg.takeCallAgainPct}%`}</td>
              </tr>
            ))}
            {teamRows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-[#9da4c1]">No team members yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3">
        <Link href="/reps" className={btnSecondary}>Browse all reps</Link>
        <Link href="/raters" className={btnSecondary}>Browse raters</Link>
      </div>
    </div>
  );
}

async function RaterManagerHome({ userId }: { userId: string }) {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      managerProfile: true,
      managedMemberships: {
        where: { endedAt: null },
        include: { member: { include: { raterProfile: true } } },
      },
    },
  });
  if (!me?.managerProfile) return <p>Manager profile not set.</p>;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wider text-[#9da4c1]">Your team</p>
        <h1 className="text-3xl font-bold mt-1">{me.name}</h1>
        <p className="text-[#c6c5d4]">Rater Manager · {me.managerProfile.company}</p>
      </header>
      <p className="text-[#c6c5d4]">{me.managedMemberships.length} managed raters.</p>
      <Link href="/raters" className={btnSecondary}>Browse raters</Link>
    </div>
  );
}

function AdminHome() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Admin</h1>
      <p className="text-[#c6c5d4]">Admin views coming soon.</p>
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

const btnPrimary =
  "inline-flex items-center px-4 py-2 rounded-lg bg-[#bbc3ff] text-[#0b1326] font-medium text-sm hover:bg-[#bbc3ff]/80";
const btnSecondary =
  "inline-flex items-center px-4 py-2 rounded-lg bg-[#131b2e] text-[#dae2fd] border border-[#2d3449] font-medium text-sm hover:bg-[#2d3449]/40";
