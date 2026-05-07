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
import { aggregateRatings, aggregateRaterRatings, type StatusTier } from "@/lib/aggregates";
import { generateRecap } from "@/lib/ai-recap";
import { RecapCard } from "@/components/RecapCard";
import { recommendTraining } from "@/lib/training-recs";
import {
  repResponseTiming,
  raterResponseTiming,
  formatHrs,
  type TimingStats,
} from "@/lib/response-timing";
import {
  totalFeedbackMoM,
  avgScoreMoM,
  teamDimensionAverages,
  resolutionRate,
  weeklyTrendSeries,
  repInteractionFrequency,
  type WeeklyTrendBucket,
  type DimensionScores,
  type MonthOverMonth,
  type ResolutionRate,
} from "@/lib/manager-stats";
import { publicRater, type PublicRater } from "@/lib/redact";
import { Prisma, ConnectionStatus, Role } from "@prisma/client";
import { InviteRater } from "./InviteRater";
import { RankingsBar } from "./RankingsBar";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const dynamic = "force-dynamic";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

const STATUS_BADGE: Record<StatusTier, string> = {
  Unverified: "bg-[#2d2d3a] text-[#9da4c1]",
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

  const agg = aggregateRatings(me.ratingsReceived, me.avatarUrl);
  const trainingRecs = recommendTraining(me.ratingsReceived);
  const timing = await repResponseTiming(prisma, userId);

  const since = Date.now() - THIRTY_DAYS_MS;
  const last30 = me.ratingsReceived.filter(
    (r) => new Date(r.createdAt).getTime() >= since,
  );
  const recap = await generateRecap({
    ratings: last30,
    perspective: "REP",
    name: me.name,
    company: me.repProfile.company,
  });

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

      <RankingsBar userId={userId} role="REP" />

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

      <TimingCard timing={timing} kind="rep" />

      <TrainingSuggestions recs={trainingRecs} />

      <RecapCard recap={recap} />

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
      ratingsGiven: {
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
  if (!me?.raterProfile) return <p>Profile setup pending.</p>;

  const pendingCount = me.raterConnections.filter((c) => c.status === "PENDING").length;
  const acceptedCount = me.raterConnections.filter((c) => c.status === "ACCEPTED").length;
  const raterAgg = aggregateRaterRatings(me.ratingsGiven, me.avatarUrl);
  const timing = await raterResponseTiming(prisma, userId);

  const since = Date.now() - THIRTY_DAYS_MS;
  const last30 = me.ratingsGiven.filter(
    (r) => new Date(r.createdAt).getTime() >= since,
  );
  const recap = await generateRecap({
    ratings: last30,
    perspective: "RATER",
    name: me.name,
    company: me.raterProfile.company,
  });

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-wider text-[#9da4c1]">Welcome back</p>
        <h1 className="text-3xl font-bold mt-1">{me.name}</h1>
        <p className="text-[#c6c5d4]">{me.raterProfile.title} · {me.raterProfile.company}</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat
          label="Status"
          value={<span className={`px-2 py-0.5 rounded ${STATUS_BADGE[raterAgg.status]}`}>{raterAgg.status}</span>}
        />
        <Stat label="Active connections" value={acceptedCount} />
        <Stat label="Pending requests" value={pendingCount} />
        <Stat label="Ratings given" value={raterAgg.ratingsGivenCount} />
      </div>

      <RankingsBar userId={userId} role="RATER" />

      <TimingCard timing={timing} kind="rater" />

      <RecapCard recap={recap} />

      <div className="flex gap-3">
        <Link href="/reps" className={btnPrimary}>Browse reps to rate</Link>
        <Link href="/connections" className={btnSecondary}>My connections</Link>
      </div>
    </div>
  );
}

interface RecentRow {
  id: string;
  createdAt: Date;
  responsiveness: number;
  productKnowledge: number;
  followThrough: number;
  listeningNeedsFit: number;
  trustIntegrity: number;
  takeCallAgain: boolean;
  rep: { id: string; name: string; title: string; company: string };
  rater: PublicRater | null;
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
      const agg = aggregateRatings(m.member.ratingsReceived, m.member.avatarUrl);
      return {
        id: m.member.id,
        name: m.member.name,
        title: m.member.repProfile!.title,
        company: m.member.repProfile!.company,
        industry: m.member.repProfile!.industry.name,
        agg,
      };
    });

  const memberIds = me.managedMemberships
    .filter((m) => m.member.repProfile)
    .map((m) => m.member.id);

  const stats = await loadTeamStats({
    where: memberIds.length === 0
      ? null
      : { repUserId: { in: memberIds }, createdAt: { gte: new Date(Date.now() - NINETY_DAYS_MS) } },
  });

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-wider text-[#9da4c1]">Your team</p>
        <h1 className="text-3xl font-bold mt-1">{me.name}</h1>
        <p className="text-[#c6c5d4]">Sales Manager · {me.managerProfile.company}</p>
      </header>

      <ManagerStatsRow
        totalFeedback={stats.totalFeedback}
        avgScore={stats.avgScore}
        resolution={stats.resolution}
      />

      <TrendChart series={stats.weekly} />

      {stats.dimensions && (
        <div className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
          <h2 className="font-bold mb-4">Average score by question (last 30 days)</h2>
          <div className="space-y-2">
            <Bar label="Responsiveness" value={stats.dimensions.responsiveness} />
            <Bar label="Product knowledge" value={stats.dimensions.productKnowledge} />
            <Bar label="Follow-through" value={stats.dimensions.followThrough} />
            <Bar label="Listening / needs fit" value={stats.dimensions.listeningNeedsFit} />
            <Bar label="Trust / integrity" value={stats.dimensions.trustIntegrity} />
          </div>
        </div>
      )}

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
              <th className="px-4 py-3 text-right">Active days (30d)</th>
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
                <td className="px-4 py-3 text-right">{stats.frequency[r.id] ?? 0}</td>
              </tr>
            ))}
            {teamRows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-[#9da4c1]">No team members yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <RecentFeedbackList rows={stats.recent} kind="rep" />

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

  const memberIds = me.managedMemberships
    .filter((m) => m.member.raterProfile)
    .map((m) => m.member.id);

  const stats = await loadTeamStats({
    where: memberIds.length === 0
      ? null
      : { raterUserId: { in: memberIds }, createdAt: { gte: new Date(Date.now() - NINETY_DAYS_MS) } },
  });

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-wider text-[#9da4c1]">Your team</p>
        <h1 className="text-3xl font-bold mt-1">{me.name}</h1>
        <p className="text-[#c6c5d4]">Rater Manager · {me.managerProfile.company}</p>
      </header>

      <p className="text-[#c6c5d4]">{me.managedMemberships.length} managed raters.</p>

      <ManagerStatsRow
        totalFeedback={stats.totalFeedback}
        avgScore={stats.avgScore}
        resolution={stats.resolution}
      />

      <TrendChart series={stats.weekly} />

      {stats.dimensions && (
        <div className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
          <h2 className="font-bold mb-4">Average score by question (last 30 days)</h2>
          <div className="space-y-2">
            <Bar label="Responsiveness" value={stats.dimensions.responsiveness} />
            <Bar label="Product knowledge" value={stats.dimensions.productKnowledge} />
            <Bar label="Follow-through" value={stats.dimensions.followThrough} />
            <Bar label="Listening / needs fit" value={stats.dimensions.listeningNeedsFit} />
            <Bar label="Trust / integrity" value={stats.dimensions.trustIntegrity} />
          </div>
        </div>
      )}

      <RecentFeedbackList rows={stats.recent} kind="rater" />

      <Link href="/raters" className={btnSecondary}>Browse raters</Link>
    </div>
  );
}

interface LoadedStats {
  totalFeedback: MonthOverMonth;
  avgScore: MonthOverMonth;
  dimensions: DimensionScores | null;
  resolution: ResolutionRate;
  weekly: WeeklyTrendBucket[];
  frequency: Record<string, number>;
  recent: RecentRow[];
}

async function loadTeamStats({ where }: { where: Prisma.RatingWhereInput | null }): Promise<LoadedStats> {
  const now = new Date();
  if (!where) {
    return {
      totalFeedback: { thisMonth: 0, lastMonth: 0, deltaPct: null },
      avgScore: { thisMonth: 0, lastMonth: 0, deltaPct: null },
      dimensions: null,
      resolution: { atRiskPairs: 0, resolvedPairs: 0, rate: null },
      weekly: weeklyTrendSeries([], now),
      frequency: {},
      recent: [],
    };
  }
  const ratings = await prisma.rating.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      rep: { include: { repProfile: true } },
      rater: {
        include: {
          raterProfile: {
            include: { industry: { select: { slug: true, name: true } } },
          },
        },
      },
    },
  });

  const dims = ratings.map((r) => ({
    createdAt: r.createdAt,
    responsiveness: r.responsiveness,
    productKnowledge: r.productKnowledge,
    followThrough: r.followThrough,
    listeningNeedsFit: r.listeningNeedsFit,
    trustIntegrity: r.trustIntegrity,
  }));
  const pairs = ratings.map((r, i) => ({
    ...dims[i],
    repUserId: r.repUserId,
    raterUserId: r.raterUserId,
  }));
  const repFreqRows = ratings.map((r) => ({
    repUserId: r.repUserId,
    createdAt: r.createdAt,
  }));

  const recent: RecentRow[] = ratings.slice(0, 10).map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    responsiveness: r.responsiveness,
    productKnowledge: r.productKnowledge,
    followThrough: r.followThrough,
    listeningNeedsFit: r.listeningNeedsFit,
    trustIntegrity: r.trustIntegrity,
    takeCallAgain: r.takeCallAgain,
    rep: {
      id: r.rep.id,
      name: r.rep.name,
      title: r.rep.repProfile?.title ?? "",
      company: r.rep.repProfile?.company ?? "",
    },
    rater: r.rater.raterProfile
      ? publicRater({
          userId: r.rater.id,
          user: r.rater,
          title: r.rater.raterProfile.title,
          company: r.rater.raterProfile.company,
          industry: r.rater.raterProfile.industry,
        })
      : null,
  }));

  return {
    totalFeedback: totalFeedbackMoM(ratings, now),
    avgScore: avgScoreMoM(dims, now),
    dimensions: teamDimensionAverages(dims, now),
    resolution: resolutionRate(pairs),
    weekly: weeklyTrendSeries(dims, now),
    frequency: repInteractionFrequency(repFreqRows, now),
    recent,
  };
}

function ManagerStatsRow({
  totalFeedback,
  avgScore,
  resolution,
}: {
  totalFeedback: MonthOverMonth;
  avgScore: MonthOverMonth;
  resolution: ResolutionRate;
}) {
  const pctResolved =
    resolution.rate === null ? null : Math.round(resolution.rate * 100);
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="bg-[#131b2e] rounded-lg border border-[#171f33]/50 p-4">
        <div className="text-xs uppercase tracking-wider text-[#9da4c1]">Feedback this month</div>
        <div className="flex items-baseline gap-2 mt-1">
          <div className="text-2xl font-bold">{totalFeedback.thisMonth}</div>
          <DeltaPill delta={totalFeedback.deltaPct} />
        </div>
        <div className="text-xs text-[#9da4c1] mt-1">vs {totalFeedback.lastMonth} last month</div>
      </div>
      <div className="bg-[#131b2e] rounded-lg border border-[#171f33]/50 p-4">
        <div className="text-xs uppercase tracking-wider text-[#9da4c1]">Avg score this month</div>
        <div className="flex items-baseline gap-2 mt-1">
          <div className="text-2xl font-bold">
            {avgScore.thisMonth === 0 ? "—" : avgScore.thisMonth.toFixed(1)}
          </div>
          <DeltaPill delta={avgScore.deltaPct} />
        </div>
        <div className="text-xs text-[#9da4c1] mt-1">
          vs {avgScore.lastMonth === 0 ? "—" : avgScore.lastMonth.toFixed(1)} last month
        </div>
      </div>
      <div className="bg-[#131b2e] rounded-lg border border-[#171f33]/50 p-4">
        <div className="text-xs uppercase tracking-wider text-[#9da4c1]">Resolution rate</div>
        <div className="text-2xl font-bold mt-1">
          {pctResolved === null ? "—" : `${pctResolved}%`}
        </div>
        <div className="text-xs text-[#9da4c1] mt-1">
          {resolution.resolvedPairs}/{resolution.atRiskPairs} at-risk pairs recovered
        </div>
      </div>
    </div>
  );
}

function DeltaPill({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-xs text-[#9da4c1]">—</span>;
  const cls =
    delta > 0
      ? "bg-[#0f3a2a] text-[#7adfaf]"
      : delta < 0
      ? "bg-[#3a1d1d] text-[#f5867a]"
      : "bg-[#3a2d1d] text-[#f5c97a]";
  const sign = delta > 0 ? "+" : "";
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${cls}`}>
      {sign}{delta}%
    </span>
  );
}

function TrendChart({ series }: { series: WeeklyTrendBucket[] }) {
  const W = 100;
  const H = 60;
  const PAD_Y = 4;
  const usable = H - PAD_Y * 2;
  const stepX = series.length > 1 ? W / (series.length - 1) : W;

  const points = series.map((b, i) => {
    if (b.avgOverall === null) return null;
    const x = i * stepX;
    const y = PAD_Y + (1 - b.avgOverall / 5) * usable;
    return { x, y, value: b.avgOverall, weekStart: b.weekStart };
  });

  const segments: Array<Array<{ x: number; y: number }>> = [];
  let curr: Array<{ x: number; y: number }> = [];
  for (const p of points) {
    if (p === null) {
      if (curr.length > 0) {
        segments.push(curr);
        curr = [];
      }
    } else {
      curr.push({ x: p.x, y: p.y });
    }
  }
  if (curr.length > 0) segments.push(curr);

  const hasAny = points.some((p) => p !== null);

  return (
    <div className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
      <h2 className="font-bold mb-4">Rating trend (last 12 weeks)</h2>
      {hasAny ? (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="none"
          className="block"
          role="img"
          aria-label="Weekly average rating trend"
        >
          {segments.map((seg, i) => (
            <polyline
              key={i}
              fill="none"
              stroke="#bbc3ff"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              points={seg.map((p) => `${p.x},${p.y}`).join(" ")}
            />
          ))}
          {points.map((p, i) =>
            p === null ? null : (
              <circle key={i} cx={p.x} cy={p.y} r={1.2} fill="#bbc3ff" />
            ),
          )}
        </svg>
      ) : (
        <p className="text-sm text-[#9da4c1]">No feedback in the last 12 weeks.</p>
      )}
    </div>
  );
}

function RecentFeedbackList({ rows, kind }: { rows: RecentRow[]; kind: "rep" | "rater" }) {
  if (rows.length === 0) {
    return (
      <div className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
        <h2 className="font-bold mb-2">Recent feedback</h2>
        <p className="text-sm text-[#9da4c1]">No ratings yet.</p>
      </div>
    );
  }
  return (
    <div className="bg-[#131b2e] rounded-xl border border-[#171f33]/50 overflow-hidden">
      <h2 className="font-bold px-6 pt-6 pb-2">Recent feedback</h2>
      <table className="w-full text-sm">
        <thead className="bg-[#0b1326]">
          <tr className="text-left text-xs uppercase tracking-wider text-[#9da4c1]">
            <th className="px-4 py-3">{kind === "rep" ? "Rep" : "Rated"}</th>
            <th className="px-4 py-3">Rater</th>
            <th className="px-4 py-3 text-center">R</th>
            <th className="px-4 py-3 text-center">PK</th>
            <th className="px-4 py-3 text-center">FT</th>
            <th className="px-4 py-3 text-center">LN</th>
            <th className="px-4 py-3 text-center">TI</th>
            <th className="px-4 py-3 text-center">Take call?</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-[#171f33]/50">
              <td className="px-4 py-3">
                <Link href={`/reps/${r.rep.id}`} className="text-[#dae2fd] hover:text-[#bbc3ff]">
                  {r.rep.name}
                </Link>
                {(r.rep.title || r.rep.company) && (
                  <div className="text-xs text-[#9da4c1]">{r.rep.title}{r.rep.title && r.rep.company ? " · " : ""}{r.rep.company}</div>
                )}
              </td>
              <td className="px-4 py-3 text-[#c6c5d4]">
                {r.rater ? `${r.rater.title} @ ${r.rater.company}` : "—"}
              </td>
              <td className="px-4 py-3 text-center">{r.responsiveness}</td>
              <td className="px-4 py-3 text-center">{r.productKnowledge}</td>
              <td className="px-4 py-3 text-center">{r.followThrough}</td>
              <td className="px-4 py-3 text-center">{r.listeningNeedsFit}</td>
              <td className="px-4 py-3 text-center">{r.trustIntegrity}</td>
              <td className="px-4 py-3 text-center">
                {r.takeCallAgain ? (
                  <span className="text-[#7adfaf]">Yes</span>
                ) : (
                  <span className="text-[#f5867a]">No</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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

function TimingCard({
  timing,
  kind,
}: {
  timing: TimingStats;
  kind: "rep" | "rater";
}) {
  const a = formatHrs(timing.avgConnectionResponseHrs);
  const b = formatHrs(timing.avgRatingFulfillmentHrs);
  const aLabel =
    kind === "rep" ? "Avg connection response" : "Avg time to accept connections";
  const bLabel =
    kind === "rep" ? "Avg time to receive a rating" : "Avg time to fulfill rating asks";
  return (
    <div className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
      <h2 className="font-bold mb-4">Response timing</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-[#9da4c1]">{aLabel}</div>
          <div className="text-2xl font-bold mt-1">{a}</div>
          <div className="text-xs text-[#9da4c1] mt-1">
            {timing.countConnectionResponses} sample
            {timing.countConnectionResponses === 1 ? "" : "s"}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-[#9da4c1]">{bLabel}</div>
          <div className="text-2xl font-bold mt-1">{b}</div>
          <div className="text-xs text-[#9da4c1] mt-1">
            {timing.countRatingFulfillments} sample
            {timing.countRatingFulfillments === 1 ? "" : "s"}
          </div>
        </div>
      </div>
    </div>
  );
}

const DIM_PRETTY: Record<string, string> = {
  responsiveness: "Responsiveness",
  productKnowledge: "Product knowledge",
  followThrough: "Follow-through",
  listeningNeedsFit: "Listening / needs fit",
  trustIntegrity: "Trust & integrity",
};

const SEVERITY_BADGE: Record<string, string> = {
  low: "bg-[#3a1d1d] text-[#f5867a]",
  medium: "bg-[#3a2d1d] text-[#f5c97a]",
  high: "bg-[#1d3a5e] text-[#7ab3f5]",
};

function TrainingSuggestions({
  recs,
}: {
  recs: ReturnType<typeof recommendTraining>;
}) {
  if (recs.length === 0) return null;
  return (
    <div className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
      <h2 className="font-bold mb-4">Training suggestions</h2>
      <div className="space-y-4">
        {recs.map((rec) => (
          <div
            key={rec.dimension}
            className="rounded-lg border border-[#171f33]/50 bg-[#0b1326] p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium">{DIM_PRETTY[rec.dimension] ?? rec.dimension}</div>
              <span
                className={`text-xs px-2 py-0.5 rounded ${SEVERITY_BADGE[rec.severity]}`}
              >
                {rec.severity} · {rec.averageScore.toFixed(1)}
              </span>
            </div>
            <p className="text-sm text-[#c6c5d4]">{rec.suggestion}</p>
            {rec.resources.length > 0 && (
              <ul className="mt-2 list-disc list-inside text-sm">
                {rec.resources.map((res) => (
                  <li key={res.url}>
                    <a
                      href={res.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#bbc3ff] hover:underline"
                    >
                      {res.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
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
