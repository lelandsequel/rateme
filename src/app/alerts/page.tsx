export const dynamic = 'force-dynamic'

import { HAS_DB } from "@/lib/env";
import { mockAlerts } from "@/lib/mock";
import { prisma } from "@/lib/prisma";
import { AlertTriangle, CheckCircle, Target, TrendingUp, Info, Bell } from "lucide-react";

async function getAlerts() {
  if (!HAS_DB) return mockAlerts;

  const tenant = await prisma.tENANT.findUnique({ where: { slug: "demo" } });
  if (!tenant) return [];

  return prisma.aLERT.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
  });
}

export default async function AlertsPage() {
  const alerts = await getAlerts();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-headline font-bold text-[#dae2fd]">Signal Inbox</h2>
        <p className="text-[#c6c5d4] mt-1">AI-powered alerts and anomalies</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-[#131b2e] rounded-xl p-4 border border-[#171f33]/50">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="text-[#bbc3ff]" size={18} />
            <span className="text-xs font-bold text-[#bbc3ff] tracking-wider uppercase">Total</span>
          </div>
          <p className="text-2xl font-headline font-bold text-[#dae2fd]">{alerts.length}</p>
        </div>
        <div className="bg-[#131b2e] rounded-xl p-4 border border-[#171f33]/50">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="text-red-400" size={18} />
            <span className="text-xs font-bold text-red-400 tracking-wider uppercase">Critical</span>
          </div>
          <p className="text-2xl font-headline font-bold text-[#dae2fd]">
            {alerts.filter((a) => a.severity === "CRITICAL").length}
          </p>
        </div>
        <div className="bg-[#131b2e] rounded-xl p-4 border border-[#171f33]/50">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="text-yellow-400" size={18} />
            <span className="text-xs font-bold text-yellow-400 tracking-wider uppercase">Warning</span>
          </div>
          <p className="text-2xl font-headline font-bold text-[#dae2fd]">
            {alerts.filter((a) => a.severity === "WARNING").length}
          </p>
        </div>
        <div className="bg-[#131b2e] rounded-xl p-4 border border-[#171f33]/50">
          <div className="flex items-center gap-2 mb-2">
            <Info className="text-[#94ccff]" size={18} />
            <span className="text-xs font-bold text-[#94ccff] tracking-wider uppercase">Info</span>
          </div>
          <p className="text-2xl font-headline font-bold text-[#dae2fd]">
            {alerts.filter((a) => a.severity === "INFO").length}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`p-4 rounded-xl border ${
              alert.severity === "CRITICAL"
                ? "bg-[#93000a]/10 border-[#93000a]/30"
                : alert.severity === "WARNING"
                ? "bg-yellow-500/10 border-yellow-500/20"
                : "bg-[#131b2e] border-[#171f33]/50"
            }`}
          >
            <div className="flex items-start gap-4">
              {alert.type === "SCORE_DROP" && <AlertTriangle className="text-yellow-400 mt-1" size={20} />}
              {alert.type === "ANOMALY" && <AlertTriangle className="text-red-400 mt-1" size={20} />}
              {alert.type === "MILESTONE" && <CheckCircle className="text-green-400 mt-1" size={20} />}
              {alert.type === "LOW_CONFIDENCE" && <Target className="text-[#94ccff] mt-1" size={20} />}
              
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium text-[#dae2fd]">{alert.title}</h3>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full ${
                      alert.severity === "CRITICAL"
                        ? "bg-red-500/20 text-red-400"
                        : alert.severity === "WARNING"
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-[#94ccff]/20 text-[#94ccff]"
                    }`}
                  >
                    {alert.severity}
                  </span>
                </div>
                <p className="text-sm text-[#c6c5d4]">{alert.message}</p>
                <p className="text-xs text-[#c6c5d4]/50 mt-2">
                  {alert.createdAt.toLocaleString()}
                </p>
              </div>

              {!alert.acknowledged && (
                <button className="px-3 py-1 text-xs bg-[#2d3449] text-[#dae2fd] rounded-lg hover:bg-[#2d3449]/80 transition-colors">
                  Acknowledge
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}