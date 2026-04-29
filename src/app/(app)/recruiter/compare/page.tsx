export const dynamic = 'force-dynamic'

const HAS_DB = !!process.env.DATABASE_URL;

import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

export default function GitComparePage() {
  const candidates = [
    { id: "c1", name: "Alex Rivera", title: "Senior AE", score: 91.5, confidence: 0.88, strength: ["Enterprise exp", "Quota attainment"] },
    { id: "c2", name: "Jordan Lee", title: "Account Executive", score: 87.2, confidence: 0.82, strength: ["Technical background", "Fast learner"] },
  ];

  return (
    <div className="space-y-6">
      <Link href="/recruiter" className="inline-flex items-center gap-2 text-[#c6c5d4] hover:text-[#dae2fd] transition-colors">
        <ArrowLeft size={18} />
        <span className="text-sm">Back to Recruiter</span>
      </Link>

      <div>
        <h2 className="text-3xl font-headline font-bold text-[#dae2fd]">Candidate Comparison</h2>
        <p className="text-[#c6c5d4] mt-1">Side-by-side candidate analysis</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {candidates.map((candidate, idx) => (
          <div key={candidate.id} className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#bbc3ff] to-[#001d92] flex items-center justify-center text-xl font-bold text-[#0b1326]">
                {candidate.name.split(" ").map((n) => n[0]).join("")}
              </div>
              <div>
                <h3 className="text-xl font-headline font-bold text-[#dae2fd]">{candidate.name}</h3>
                <p className="text-[#c6c5d4]">{candidate.title}</p>
              </div>
            </div>

            <div className="bg-[#0b1326] rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-[#c6c5d4]">Predicted Score</span>
                <span className="text-2xl font-headline font-bold text-[#bbc3ff]">{candidate.score}</span>
              </div>
              <div className="h-2 bg-[#2d3449] rounded-full overflow-hidden">
                <div className="h-full bg-[#bbc3ff]" style={{ width: `${candidate.score}%` }} />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-[#c6c5d4] uppercase">Strengths</p>
              {candidate.strength.map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <ArrowRight size={14} className="text-green-400" />
                  <span className="text-sm text-[#dae2fd]">{s}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}