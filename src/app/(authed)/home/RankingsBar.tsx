// Rankings pill row for /home.
//
// REP   — Team rank + Industry-Regional rank
// RATER — Industry-Regional rank + Fulfillment %
// Pill tone: top 25% green, middle gray, bottom 25% amber.

import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  raterFulfillmentRate,
  raterIndustryRegionalRanking,
  repIndustryRegionalRanking,
  repTeamRanking,
  type Ranking,
} from "@/lib/rankings";

function toneForPercentile(percentile: number): string {
  if (percentile >= 75) return "bg-[#dcfce7] text-[#166534]";
  if (percentile <= 25) return "bg-[#fef3c7] text-[#92400e]";
  return "bg-[#e5e7eb] text-[#475569]";
}

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${tone}`}>
      {children}
    </span>
  );
}

function topPct(ranking: Ranking): number {
  return Math.max(1, Math.round((ranking.rank / ranking.total) * 100));
}

function RankPill({ label, ranking }: { label: string; ranking: Ranking }) {
  const tone = toneForPercentile(ranking.percentile);
  return (
    <Pill tone={tone}>
      <span className="text-xs uppercase tracking-wider opacity-80 mr-2">{label}</span>
      <span className="font-semibold">{ranking.rank}/{ranking.total}</span>
      <span className="ml-2 opacity-80">top {topPct(ranking)}%</span>
    </Pill>
  );
}

export async function RankingsBar({ userId, role }: { userId: string; role: string }) {
  if (role === Role.REP) {
    const [team, industryRegional] = await Promise.all([
      repTeamRanking(prisma, userId),
      repIndustryRegionalRanking(prisma, userId),
    ]);
    if (!team && !industryRegional) return null;
    return (
      <div className="flex flex-wrap gap-2">
        {team && <RankPill label="Team rank" ranking={team} />}
        {industryRegional && <RankPill label="Industry" ranking={industryRegional} />}
      </div>
    );
  }

  if (role === Role.RATER) {
    const [industryRegional, fulfillment] = await Promise.all([
      raterIndustryRegionalRanking(prisma, userId),
      raterFulfillmentRate(prisma, userId),
    ]);
    if (!industryRegional && fulfillment.fulfillmentPct === null) return null;
    return (
      <div className="flex flex-wrap gap-2">
        {industryRegional && (
          <Pill tone={toneForPercentile(industryRegional.percentile)}>
            <span className="text-xs uppercase tracking-wider opacity-80 mr-2">Industry rank</span>
            <span className="font-semibold">
              {industryRegional.rank}/{industryRegional.total}
            </span>
            <span className="ml-2 opacity-80">
              (top {topPct(industryRegional)}%)
            </span>
          </Pill>
        )}
        {fulfillment.fulfillmentPct !== null && (
          <Pill tone={toneForFulfillment(fulfillment.fulfillmentPct)}>
            <span className="text-xs uppercase tracking-wider opacity-80 mr-2">Fulfillment</span>
            <span className="font-semibold">{fulfillment.fulfillmentPct}%</span>
          </Pill>
        )}
      </div>
    );
  }

  return null;
}

function toneForFulfillment(pct: number): string {
  if (pct >= 75) return "bg-[#dcfce7] text-[#166534]";
  if (pct <= 25) return "bg-[#fef3c7] text-[#92400e]";
  return "bg-[#e5e7eb] text-[#475569]";
}
