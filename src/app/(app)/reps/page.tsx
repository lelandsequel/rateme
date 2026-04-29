export const dynamic = 'force-dynamic'

import { HAS_DB } from "@/lib/env";
import { mockReps } from "@/lib/mock";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Filter, ArrowUpDown, Mail, Phone, Building } from "lucide-react";

async function getReps() {
  if (!HAS_DB) return mockReps;

  const tenant = await prisma.tENANT.findUnique({ where: { slug: "demo" } });
  if (!tenant) return [];

  return prisma.rEP.findMany({
    where: { tenantId: tenant.id },
    include: {
      scores: { orderBy: { calculatedAt: "desc" }, take: 1 },
      team: true,
    },
    orderBy: { name: "asc" },
  });
}

export default async function RepsPage() {
  const reps = await getReps();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-headline font-bold text-[#dae2fd]">Rep Directory</h2>
          <p className="text-[#c6c5d4] mt-1">Manage and monitor all representatives</p>
        </div>
        <button className="bg-[#bbc3ff] text-[#0b1326] px-4 py-2 rounded-lg font-medium text-sm hover:bg-[#bbc3ff]/80 transition-colors">
          + Add Rep
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 p-4 bg-[#131b2e] rounded-xl border border-[#171f33]/50">
        <div className="flex items-center gap-2 text-[#c6c5d4]">
          <Filter size={18} />
          <span className="text-sm">Filters:</span>
        </div>
        <select className="bg-[#0b1326] text-[#dae2fd] px-3 py-1.5 rounded-lg text-sm border border-[#2d3449]">
          <option value="">All Departments</option>
          <option value="Enterprise Sales">Enterprise Sales</option>
          <option value="Mid-Market">Mid-Market</option>
          <option value="SMB">SMB</option>
        </select>
        <select className="bg-[#0b1326] text-[#dae2fd] px-3 py-1.5 rounded-lg text-sm border border-[#2d3449]">
          <option value="">All Teams</option>
          <option value="team-sales-east">Sales - East</option>
          <option value="team-sales-west">Sales - West</option>
          <option value="team-sales-central">Sales - Central</option>
        </select>
        <select className="bg-[#0b1326] text-[#dae2fd] px-3 py-1.5 rounded-lg text-sm border border-[#2d3449]">
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="ON_LEAVE">On Leave</option>
        </select>
        <div className="flex-1" />
        <button className="flex items-center gap-2 text-[#c6c5d4] text-sm hover:text-[#dae2fd]">
          <ArrowUpDown size={16} />
          Sort
        </button>
      </div>

      {/* Rep List */}
      <div className="bg-[#131b2e] rounded-xl border border-[#171f33]/50 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#171f33]/50 bg-[#0b1326]">
              <th className="text-left text-[10px] font-bold text-[#c6c5d4] uppercase tracking-wider px-6 py-4">Rep</th>
              <th className="text-left text-[10px] font-bold text-[#c6c5d4] uppercase tracking-wider px-6 py-4">Department</th>
              <th className="text-left text-[10px] font-bold text-[#c6c5d4] uppercase tracking-wider px-6 py-4">Team</th>
              <th className="text-left text-[10px] font-bold text-[#c6c5d4] uppercase tracking-wider px-6 py-4">Score</th>
              <th className="text-left text-[10px] font-bold text-[#c6c5d4] uppercase tracking-wider px-6 py-4">Confidence</th>
              <th className="text-left text-[10px] font-bold text-[#c6c5d4] uppercase tracking-wider px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {reps.map((rep) => {
              const score = rep.scores[0]?.score || 0;
              const confidence = rep.scores[0]?.confidence || 0;
              
              return (
                <tr
                  key={rep.id}
                  className="border-b border-[#171f33]/30 hover:bg-[#171f33]/30 transition-colors"
                >
                  <td className="px-6 py-4">
                    <Link href={`/reps/${rep.id}`} className="flex items-center gap-3 group">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#bbc3ff] to-[#001d92] flex items-center justify-center text-sm font-bold text-[#0b1326]">
                        {rep.name.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div>
                        <p className="font-medium text-[#dae2fd] group-hover:text-[#bbc3ff] transition-colors">
                          {rep.name}
                        </p>
                        <p className="text-xs text-[#c6c5d4]">{rep.title}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[#c6c5d4]">{rep.department}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[#c6c5d4]">{rep.team?.name || "—"}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-[#2d3449] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            score >= 90
                              ? "bg-green-400"
                              : score >= 75
                              ? "bg-[#bbc3ff]"
                              : score >= 60
                              ? "bg-yellow-400"
                              : "bg-red-400"
                          }`}
                          style={{ width: `${score}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-[#dae2fd] w-10">{score.toFixed(1)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-sm ${confidence < 0.7 ? "text-yellow-400" : "text-[#c6c5d4]"}`}>
                      {(confidence * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        rep.status === "ACTIVE"
                          ? "bg-green-500/20 text-green-400"
                          : rep.status === "INACTIVE"
                          ? "bg-[#2d3449] text-[#c6c5d4]"
                          : "bg-yellow-500/20 text-yellow-400"
                      }`}
                    >
                      {rep.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}