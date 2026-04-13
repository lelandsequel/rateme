import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { UserRoundSearch, Building, ArrowUpRight, GitCompare } from "lucide-react";

async function getCandidates() {
  const tenant = await prisma.tENANT.findUnique({ where: { slug: "demo" } });
  if (!tenant) return [];

  // Generate mock candidates for demo
  const candidates = [
    { id: "c1", name: "Alex Rivera", email: "alex.rivera@email.com", title: "Senior Account Executive", source: "LinkedIn", score: 91.5, confidence: 0.88 },
    { id: "c2", name: "Jordan Lee", email: "jordan.lee@email.com", title: "Account Executive", source: "Referral", score: 87.2, confidence: 0.82 },
    { id: "c3", name: "Taylor Smith", email: "taylor.smith@email.com", title: "Sales Manager", source: "Indeed", score: 84.8, confidence: 0.79 },
    { id: "c4", name: "Casey Morgan", email: "casey.morgan@email.com", title: "Enterprise AE", source: "LinkedIn", score: 78.3, confidence: 0.71 },
    { id: "c5", name: "Riley Johnson", email: "riley.johnson@email.com", title: "Account Executive", source: "Job Board", score: 72.1, confidence: 0.65 },
  ];

  return candidates;
}

export default async function RecruiterPage() {
  const candidates = await getCandidates();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-headline font-bold text-[#dae2fd]">Recruiter Dashboard</h2>
          <p className="text-[#c6c5d4] mt-1">AI-powered candidate intelligence</p>
        </div>
        <div className="flex gap-3">
          <Link href="/recruiter/compare" className="flex items-center gap-2 px-4 py-2 bg-[#2d3449] text-[#dae2fd] rounded-lg text-sm hover:bg-[#2d3449]/80 transition-colors">
            <GitCompare size={18} />
            GitCompare
          </Link>
          <button className="bg-[#bbc3ff] text-[#0b1326] px-4 py-2 rounded-lg font-medium text-sm hover:bg-[#bbc3ff]/80 transition-colors">
            + Add Candidate
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#131b2e] rounded-xl p-4 border border-[#171f33]/50">
          <div className="flex items-center gap-2 mb-2">
            <UserRoundSearch className="text-[#bbc3ff]" size={18} />
            <span className="text-xs font-bold text-[#bbc3ff] tracking-wider uppercase">Total</span>
          </div>
          <p className="text-2xl font-headline font-bold text-[#dae2fd]">{candidates.length}</p>
        </div>
        <div className="bg-[#131b2e] rounded-xl p-4 border border-[#171f33]/50">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-green-400">●</span>
            <span className="text-xs font-bold text-green-400 tracking-wider uppercase">High Fit</span>
          </div>
          <p className="text-2xl font-headline font-bold text-[#dae2fd]">
            {candidates.filter((c) => c.score >= 85).length}
          </p>
        </div>
        <div className="bg-[#131b2e] rounded-xl p-4 border border-[#171f33]/50">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-yellow-400">●</span>
            <span className="text-xs font-bold text-yellow-400 tracking-wider uppercase">Medium</span>
          </div>
          <p className="text-2xl font-headline font-bold text-[#dae2fd]">
            {candidates.filter((c) => c.score >= 70 && c.score < 85).length}
          </p>
        </div>
        <div className="bg-[#131b2e] rounded-xl p-4 border border-[#171f33]/50">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-red-400">●</span>
            <span className="text-xs font-bold text-red-400 tracking-wider uppercase">Low</span>
          </div>
          <p className="text-2xl font-headline font-bold text-[#dae2fd]">
            {candidates.filter((c) => c.score < 70).length}
          </p>
        </div>
      </div>

      {/* Candidate List */}
      <div className="bg-[#131b2e] rounded-xl border border-[#171f33]/50 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#171f33]/50 bg-[#0b1326]">
              <th className="text-left text-[10px] font-bold text-[#c6c5d4] uppercase tracking-wider px-6 py-4">Candidate</th>
              <th className="text-left text-[10px] font-bold text-[#c6c5d4] uppercase tracking-wider px-6 py-4">Source</th>
              <th className="text-left text-[10px] font-bold text-[#c6c5d4] uppercase tracking-wider px-6 py-4">Predicted Score</th>
              <th className="text-left text-[10px] font-bold text-[#c6c5d4] uppercase tracking-wider px-6 py-4">Confidence</th>
              <th className="text-left text-[10px] font-bold text-[#c6c5d4] uppercase tracking-wider px-6 py-4">Fit</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate) => (
              <tr key={candidate.id} className="border-b border-[#171f33]/30 hover:bg-[#171f33]/30 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#bbc3ff] to-[#001d92] flex items-center justify-center text-sm font-bold text-[#0b1326]">
                      {candidate.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div>
                      <p className="font-medium text-[#dae2fd]">{candidate.name}</p>
                      <p className="text-xs text-[#c6c5d4]">{candidate.title}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-[#c6c5d4]">{candidate.source}</span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 bg-[#2d3449] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          candidate.score >= 85
                            ? "bg-green-400"
                            : candidate.score >= 70
                            ? "bg-yellow-400"
                            : "bg-red-400"
                        }`}
                        style={{ width: `${candidate.score}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-[#dae2fd]">{candidate.score.toFixed(1)}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-[#c6c5d4]">{(candidate.confidence * 100).toFixed(0)}%</span>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      candidate.score >= 85
                        ? "bg-green-500/20 text-green-400"
                        : candidate.score >= 70
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {candidate.score >= 85 ? "High" : candidate.score >= 70 ? "Medium" : "Low"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}