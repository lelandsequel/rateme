import { prisma } from "@/lib/prisma";
import { TrendingUp, Target, AlertTriangle, CheckCircle } from "lucide-react";

async function getBenchmarks() {
  const tenant = await prisma.tENANT.findUnique({ where: { slug: "demo" } });
  if (!tenant) return [];

  return prisma.bENCHMARK.findMany({
    where: { tenantId: tenant.id },
  });
}

export default async function BenchmarksPage() {
  const benchmarks = await getBenchmarks();

  const mockStats = [
    { name: "Average Score", value: 82.4, target: 80, change: 2.1, trend: "up" },
    { name: "Top Performers", value: "40%", target: "35%", change: "5pp", trend: "up" },
    { name: "Below Threshold", value: "15%", target: "20%", change: "-3pp", trend: "down" },
    { name: "Avg Confidence", value: "81%", target: "85%", change: "-4pp", trend: "down" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-headline font-bold text-[#dae2fd]">Benchmark Lab</h2>
        <p className="text-[#c6c5d4] mt-1">Define and track performance benchmarks</p>
      </div>

      {/* Current Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {mockStats.map((stat) => (
          <div key={stat.name} className="bg-[#131b2e] rounded-xl p-4 border border-[#171f33]/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[#c6c5d4] uppercase">{stat.name}</span>
              {stat.trend === "up" ? (
                <TrendingUp size={16} className="text-green-400" />
              ) : (
                <TrendingUp size={16} className="text-red-400 transform rotate-180" />
              )}
            </div>
            <p className="text-2xl font-headline font-bold text-[#dae2fd]">{stat.value}</p>
            <p className="text-xs text-[#c6c5d4]">Target: {stat.target}</p>
          </div>
        ))}
      </div>

      {/* Benchmarks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {benchmarks.map((benchmark) => {
          const thresholds = benchmark.thresholds ? JSON.parse(benchmark.thresholds) : {};
          
          return (
            <div key={benchmark.id} className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-[#001d92] flex items-center justify-center">
                  {benchmark.type === "threshold" ? (
                    <Target className="text-[#bbc3ff]" size={20} />
                  ) : (
                    <TrendingUp className="text-[#bbc3ff]" size={20} />
                  )}
                </div>
                <div>
                  <h3 className="font-headline font-bold text-[#dae2fd]">{benchmark.name}</h3>
                  <p className="text-xs text-[#c6c5d4]">{benchmark.type}</p>
                </div>
              </div>

              {benchmark.formula && (
                <div className="bg-[#0b1326] rounded-lg p-3 mb-4">
                  <p className="text-xs text-[#c6c5d4] mb-1">Formula</p>
                  <p className="text-sm text-[#bbc3ff] font-mono">{benchmark.formula}</p>
                </div>
              )}

              {thresholds.excellent !== undefined && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-green-400">Excellent</span>
                    <span className="text-sm text-[#dae2fd]">{thresholds.excellent}+</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#bbc3ff]">Good</span>
                    <span className="text-sm text-[#dae2fd]">{thresholds.good}+</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-yellow-400">Needs Improvement</span>
                    <span className="text-sm text-[#dae2fd]">&lt;{thresholds.needsImprovement}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Add New Benchmark Card */}
        <div className="bg-[#131b2e] rounded-xl p-6 border border-dashed border-[#2d3449] flex flex-col items-center justify-center min-h-[200px] cursor-pointer hover:border-[#bbc3ff]/50 transition-colors">
          <div className="w-12 h-12 rounded-full bg-[#2d3449] flex items-center justify-center mb-4">
            <span className="text-2xl text-[#c6c5d4]">+</span>
          </div>
          <p className="text-[#c6c5d4]">Create new benchmark</p>
        </div>
      </div>
    </div>
  );
}