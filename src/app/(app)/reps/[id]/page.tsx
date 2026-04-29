export const dynamic = 'force-dynamic'

import { HAS_DB } from "@/lib/env";
import { mockReps } from "@/lib/mock";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, Phone, Building, Calendar, TrendingUp, TrendingDown, AlertTriangle, Activity, Target, Clock } from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RepProfilePage({ params }: Props) {
  const { id } = await params;
  
  const rep = HAS_DB
    ? await prisma.rEP.findUnique({
        where: { id },
        include: {
          scores: { orderBy: { calculatedAt: "desc" }, take: 10 },
          team: true,
          sessions: { orderBy: { startedAt: "desc" }, take: 5 },
        },
      })
    : (mockReps.find((r) => r.id === id) ?? mockReps[0]);

  if (!rep) {
    notFound();
  }

  const score = rep.scores[0];
  const previousScore = rep.scores[1];
  const scoreChange = score && previousScore ? score.score - previousScore.score : 0;

  // Calculate score breakdown (mock for demo)
  const dimensions = [
    { name: "Call Efficiency", score: Math.min(100, score.score + Math.random() * 10 - 5), weight: 0.3 },
    { name: "Engagement", score: Math.min(100, score.score + Math.random() * 10 - 5), weight: 0.25 },
    { name: "Conversion", score: Math.min(100, score.score + Math.random() * 10 - 5), weight: 0.25 },
    { name: "Activity", score: Math.min(100, score.score + Math.random() * 10 - 5), weight: 0.2 },
  ];

  return (
    <div className="space-y-6">
      <Link href="/reps" className="inline-flex items-center gap-2 text-[#c6c5d4] hover:text-[#dae2fd] transition-colors">
        <ArrowLeft size={18} />
        <span className="text-sm">Back to Reps</span>
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="lg:col-span-1 bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
          <div className="text-center">
            <div className="w-24 h-24 mx-auto rounded-2xl bg-gradient-to-br from-[#bbc3ff] to-[#001d92] flex items-center justify-center text-3xl font-bold text-[#0b1326] mb-4">
              {rep.name.split(" ").map((n) => n[0]).join("")}
            </div>
            <h1 className="text-2xl font-headline font-bold text-[#dae2fd]">{rep.name}</h1>
            <p className="text-[#c6c5d4] mt-1">{rep.title}</p>
            
            <div className="flex items-center justify-center gap-2 mt-4">
              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  rep.status === "ACTIVE"
                    ? "bg-green-500/20 text-green-400"
                    : "bg-[#2d3449] text-[#c6c5d4]"
                }`}
              >
                {rep.status}
              </span>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-3 text-[#c6c5d4]">
              <Mail size={16} />
              <span className="text-sm">{rep.email}</span>
            </div>
            <div className="flex items-center gap-3 text-[#c6c5d4]">
              <Building size={16} />
              <span className="text-sm">{rep.department}</span>
            </div>
            {rep.team && (
              <div className="flex items-center gap-3 text-[#c6c5d4]">
                <Activity size={16} />
                <span className="text-sm">{rep.team.name}</span>
              </div>
            )}
            {rep.hireDate && (
              <div className="flex items-center gap-3 text-[#c6c5d4]">
                <Calendar size={16} />
                <span className="text-sm">
                  Joined {rep.hireDate.toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Score Card */}
        <div className="lg:col-span-2 bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-headline font-bold text-[#dae2fd]">Performance Score</h2>
              <p className="text-sm text-[#c6c5d4]">QUASAR Engine Analysis</p>
            </div>
            <div className="flex items-center gap-2">
              {scoreChange > 0 && (
                <span className="flex items-center gap-1 text-green-400 text-sm">
                  <TrendingUp size={16} />
                  +{scoreChange.toFixed(1)}
                </span>
              )}
              {scoreChange < 0 && (
                <span className="flex items-center gap-1 text-red-400 text-sm">
                  <TrendingDown size={16} />
                  {scoreChange.toFixed(1)}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Main Score */}
            <div className="bg-[#0b1326] rounded-xl p-6 flex flex-col items-center justify-center">
              <div className="relative w-32 h-32">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke="#2d3449"
                    strokeWidth="8"
                    fill="none"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke={score.score >= 90 ? "#22c55e" : score.score >= 75 ? "#bbc3ff" : score.score >= 60 ? "#eab308" : "#ef4444"}
                    strokeWidth="8"
                    fill="none"
                    strokeDasharray={`${(score.score / 100) * 352} 352`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-headline font-black text-[#dae2fd]">
                    {score.score.toFixed(1)}
                  </span>
                  <span className="text-xs text-[#c6c5d4]">/100</span>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4">
                <Target size={14} className="text-[#c6c5d4]" />
                <span className="text-xs text-[#c6c5d4]">
                  {(score.confidence * 100).toFixed(0)}% confidence
                </span>
              </div>
            </div>

            {/* Dimensions */}
            <div className="space-y-4">
              {dimensions.map((dim) => (
                <div key={dim.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-[#c6c5d4]">{dim.name}</span>
                    <span className="text-sm font-medium text-[#dae2fd]">{dim.score.toFixed(1)}</span>
                  </div>
                  <div className="h-2 bg-[#2d3449] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#bbc3ff] rounded-full"
                      style={{ width: `${dim.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Score History */}
      <div className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
        <h2 className="text-lg font-headline font-bold text-[#dae2fd] mb-4">Score History</h2>
        <div className="flex items-end gap-2 h-32">
          {rep.scores.map((s, i) => (
            <div key={s.id} className="flex-1 flex flex-col items-center gap-2">
              <div
                className={`w-full rounded-t-lg ${
                  s.score >= 90
                    ? "bg-green-500"
                    : s.score >= 75
                    ? "bg-[#bbc3ff]"
                    : s.score >= 60
                    ? "bg-yellow-500"
                    : "bg-red-500"
                }`}
                style={{ height: `${s.score}%`, minHeight: "4px" }}
              />
              <span className="text-xs text-[#c6c5d4]">{s.period || `#${i + 1}`}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Sessions */}
      <div className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
        <h2 className="text-lg font-headline font-bold text-[#dae2fd] mb-4">Recent Sessions</h2>
        {rep.sessions.length === 0 ? (
          <p className="text-[#c6c5d4]">No sessions recorded yet</p>
        ) : (
          <div className="space-y-3">
            {rep.sessions.map((session) => (
              <div key={session.id} className="flex items-center gap-4 p-3 bg-[#0b1326] rounded-lg">
                <div className={`w-1 h-12 rounded-full ${session.type === "CALL" ? "bg-[#94ccff]" : "bg-[#cdc1e5]"}`} />
                <div className="flex-1">
                  <p className="font-medium text-[#dae2fd]">{session.title}</p>
                  <p className="text-xs text-[#c6c5d4]">{session.startedAt.toLocaleString()}</p>
                </div>
                {session.sentiment && (
                  <span
                    className={`text-sm ${
                      session.sentiment > 0.5
                        ? "text-green-400"
                        : session.sentiment < 0.3
                        ? "text-red-400"
                        : "text-yellow-400"
                    }`}
                  >
                    {(session.sentiment * 100).toFixed(0)}% sentiment
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}