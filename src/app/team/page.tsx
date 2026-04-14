export const dynamic = 'force-dynamic'

import { HAS_DB } from "@/lib/env";
import { mockTeams } from "@/lib/mock";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Users, TrendingUp, ArrowUpRight, Building } from "lucide-react";

async function getTeams() {
  if (!HAS_DB) return mockTeams;

  const tenant = await prisma.tENANT.findUnique({ where: { slug: "demo" } });
  if (!tenant) return [];

  return prisma.tEAM.findMany({
    where: { tenantId: tenant.id },
    include: {
      reps: {
        include: { scores: { orderBy: { calculatedAt: "desc" }, take: 1 } },
      },
    },
  });
}

export default async function TeamPage() {
  const teams = await getTeams();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-headline font-bold text-[#dae2fd]">Team Manager Workbench</h2>
        <p className="text-[#c6c5d4] mt-1">Manage teams and monitor performance</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {teams.map((team) => {
          const teamReps = team.reps;
          const avgScore = teamReps.reduce((acc, r) => acc + (r.scores[0]?.score || 0), 0) / teamReps.length || 0;
          const topRep = teamReps.reduce((best, rep) => {
            const s = rep.scores[0]?.score || 0;
            const b = best.scores[0]?.score || 0;
            return s > b ? rep : best;
          }, teamReps[0]);

          return (
            <div key={team.id} className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-[#001d92] flex items-center justify-center">
                    <Building className="text-[#bbc3ff]" size={24} />
                  </div>
                  <div>
                    <h3 className="font-headline font-bold text-[#dae2fd]">{team.name}</h3>
                    <p className="text-xs text-[#c6c5d4]">{team.reps.length} team members</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-headline font-black text-[#bbc3ff]">{avgScore.toFixed(1)}</p>
                  <p className="text-xs text-[#c6c5d4]">avg score</p>
                </div>
              </div>

              {team.description && (
                <p className="text-sm text-[#c6c5d4] mb-4">{team.description}</p>
              )}

              {/* Team Members */}
              <div className="space-y-2">
                {teamReps.map((rep) => (
                  <Link
                    key={rep.id}
                    href={`/reps/${rep.id}`}
                    className="flex items-center justify-between p-3 bg-[#0b1326] rounded-lg hover:bg-[#171f33]/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#bbc3ff] to-[#001d92] flex items-center justify-center text-xs font-bold text-[#0b1326]">
                        {rep.name.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#dae2fd]">{rep.name}</p>
                        <p className="text-xs text-[#c6c5d4]">{rep.title}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[#dae2fd]">
                        {rep.scores[0]?.score.toFixed(1) || "—"}
                      </span>
                      <ArrowUpRight size={16} className="text-[#c6c5d4]" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}