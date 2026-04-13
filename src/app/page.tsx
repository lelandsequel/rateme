export const dynamic = 'force-dynamic'

const HAS_DB = !!process.env.DATABASE_URL;

import { prisma } from "@/lib/prisma";
import { AlertTriangle, TrendingUp, TrendingDown, CheckCircle, Users, Target } from "lucide-react";

async function getData() {
  const tenant = await prisma.tENANT.findUnique({ where: { slug: "demo" } });
  if (!tenant) return null;

  const reps = await prisma.rEP.findMany({
    where: { tenantId: tenant.id, status: "ACTIVE" },
    include: {
      scores: { orderBy: { calculatedAt: "desc" }, take: 1 },
      team: true,
    },
  });

  const alerts = await prisma.aLERT.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const teams = await prisma.tEAM.findMany({
    where: { tenantId: tenant.id },
    include: { reps: true },
  });

  return { tenant, reps, alerts, teams };
}

export default async function OverviewPage() {
  const data = await getData();
  if (!data) return <div>Loading...</div>;

  const { reps, alerts, teams, tenant } = data;

  // Calculate stats
  const avgScore = reps.reduce((acc, r) => acc + (r.scores[0]?.score || 0), 0) / reps.length || 0;
  const topPerformers = reps.filter((r) => (r.scores[0]?.score || 0) >= 90).length;
  const needsAttention = reps.filter((r) => (r.scores[0]?.score || 0) < 70).length;

  // Find top rep
  const topRep = reps.reduce((best, rep) => {
    const score = rep.scores[0]?.score || 0;
    const bestScore = best.scores[0]?.score || 0;
    return score > bestScore ? rep : best;
  }, reps[0]);

  // Find at-risk rep
  const atRiskRep = reps.reduce((worst, rep) => {
    const score = rep.scores[0]?.score || 0;
    const worstScore = worst.scores[0]?.score || 0;
    return score < worstScore ? rep : worst;
  }, reps[0]);

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
        <div className="lg:col-span-8">
          <h2 className="font-headline font-extrabold text-4xl text-[#dae2fd] tracking-tight mb-2">
            Executive Intelligence Center
          </h2>
          <p className="text-[#c6c5d4] max-w-2xl leading-relaxed">
            Sovereign insights powered by QUASAR engine. Analyzing real-time performance clusters across the global organization.
          </p>
        </div>
        <div className="lg:col-span-4 flex justify-end">
          <div className="bg-[#131b2e] p-6 rounded-xl w-full border border-[#bbc3ff]/5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[#c6c5d4] text-xs font-bold tracking-widest uppercase">QUASAR CORE</span>
              <span className="bg-green-500/10 text-green-400 text-[10px] px-2 py-0.5 rounded-full border border-green-500/20">
                OPERATIONAL
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-headline font-black text-[#dae2fd]">{avgScore.toFixed(1)}</span>
              <span className="text-[#bbc3ff] font-bold text-xl">/100</span>
            </div>
            <p className="text-xs text-[#c6c5d4] mt-2">Global Org Health Score</p>
          </div>
        </div>
      </section>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-2 w-2 rounded-full bg-[#bbc3ff]"></div>
            <span className="text-[10px] font-bold text-[#bbc3ff] tracking-[0.2em] uppercase">TOTAL REPS</span>
          </div>
          <p className="text-3xl font-headline font-bold text-[#dae2fd]">{reps.length}</p>
          <p className="text-xs text-[#c6c5d4] mt-1">Active representatives</p>
        </div>

        <div className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-2 w-2 rounded-full bg-green-400"></div>
            <span className="text-[10px] font-bold text-green-400 tracking-[0.2em] uppercase">TOP PERFORMERS</span>
          </div>
          <p className="text-3xl font-headline font-bold text-[#dae2fd]">{topPerformers}</p>
          <p className="text-xs text-[#c6c5d4] mt-1">Score 90+</p>
        </div>

        <div className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-2 w-2 rounded-full bg-yellow-400"></div>
            <span className="text-[10px] font-bold text-yellow-400 tracking-[0.2em] uppercase">NEEDS ATTENTION</span>
          </div>
          <p className="text-3xl font-headline font-bold text-[#dae2fd]">{needsAttention}</p>
          <p className="text-xs text-[#c6c5d4] mt-1">Score below 70</p>
        </div>

        <div className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-2 w-2 rounded-full bg-[#94ccff]"></div>
            <span className="text-[10px] font-bold text-[#94ccff] tracking-[0.2em] uppercase">TEAMS</span>
          </div>
          <p className="text-3xl font-headline font-bold text-[#dae2fd]">{teams.length}</p>
          <p className="text-xs text-[#c6c5d4] mt-1">Active teams</p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Performer */}
        <div className="lg:col-span-2 bg-[#131b2e] rounded-xl p-8 relative overflow-hidden">
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-[#bbc3ff]/10 rounded-full blur-[80px]"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-6">
              <div className="h-2 w-2 rounded-full bg-[#bbc3ff]"></div>
              <span className="text-[10px] font-bold text-[#bbc3ff] tracking-[0.2em] uppercase font-headline">Top Performer</span>
            </div>
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#bbc3ff] to-[#001d92] flex items-center justify-center text-2xl font-bold text-[#0b1326]">
                {topRep.name.split(" ").map((n) => n[0]).join("")}
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-headline font-bold text-[#dae2fd] mb-1">{topRep.name}</h3>
                <p className="text-[#c6c5d4] mb-2">{topRep.title} • {topRep.team?.name || "No Team"}</p>
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl font-headline font-black text-[#bbc3ff]">
                    {topRep.scores[0]?.score.toFixed(1)}
                  </span>
                  <span className="text-[#c6c5d4]">/100</span>
                  <span className="text-xs text-[#c6c5d4]/70">
                    {(topRep.scores[0]?.confidence * 100).toFixed(0)}% confidence
                  </span>
                </div>
              </div>
              <TrendingUp className="text-green-400" size={32} />
            </div>
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-[#131b2e] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-[#ffb4ab]"></div>
              <span className="text-[10px] font-bold text-[#ffb4ab] tracking-[0.2em] uppercase">Alerts</span>
            </div>
            <span className="text-xs text-[#c6c5d4]">{alerts.length} active</span>
          </div>

          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-3 rounded-lg border ${
                  alert.severity === "CRITICAL"
                    ? "bg-[#93000a]/20 border-[#93000a]/30"
                    : alert.severity === "WARNING"
                    ? "bg-yellow-500/10 border-yellow-500/20"
                    : "bg-[#2d3449]/30 border-[#2d3449]/50"
                }`}
              >
                <div className="flex items-start gap-2">
                  {alert.type === "SCORE_DROP" && <AlertTriangle size={16} className="text-yellow-400 mt-0.5" />}
                  {alert.type === "ANOMALY" && <AlertTriangle size={16} className="text-red-400 mt-0.5" />}
                  {alert.type === "MILESTONE" && <CheckCircle size={16} className="text-green-400 mt-0.5" />}
                  {alert.type === "LOW_CONFIDENCE" && <Target size={16} className="text-[#94ccff] mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#dae2fd] truncate">{alert.title}</p>
                    <p className="text-xs text-[#c6c5d4] truncate">{alert.message}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Team Breakdown */}
      <div className="bg-[#131b2e] rounded-xl p-8">
        <h3 className="text-xl font-headline font-bold text-[#dae2fd] mb-6">Team Performance</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {teams.map((team) => {
            const teamReps = reps.filter((r) => r.teamId === team.id);
            const teamAvg = teamReps.reduce((acc, r) => acc + (r.scores[0]?.score || 0), 0) / teamReps.length || 0;
            
            return (
              <div key={team.id} className="bg-[#0b1326] rounded-lg p-6 border border-[#171f33]/50">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-headline font-semibold text-[#dae2fd]">{team.name}</h4>
                  <span className="text-2xl font-headline font-bold text-[#bbc3ff]">{teamAvg.toFixed(1)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-[#c6c5d4]" />
                  <span className="text-sm text-[#c6c5d4]">{teamReps.length} reps</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}