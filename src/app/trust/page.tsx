import { Shield, Database, Code, Lock, Activity, CheckCircle } from "lucide-react";

export default function TrustPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-headline font-bold text-[#dae2fd]">Trust & Provenance</h2>
        <p className="text-[#c6c5d4] mt-1">COSMIC governance and data provenance</p>
      </div>

      {/* COSMIC Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <Activity className="text-green-400" size={20} />
            </div>
            <h3 className="font-headline font-bold text-[#dae2fd]">QUASAR</h3>
          </div>
          <p className="text-sm text-green-400">Operational</p>
          <p className="text-xs text-[#c6c5d4]">Last run: just now</p>
        </div>

        <div className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <Shield className="text-green-400" size={20} />
            </div>
            <h3 className="font-headline font-bold text-[#dae2fd]">AURORA</h3>
          </div>
          <p className="text-sm text-green-400">Operational</p>
          <p className="text-xs text-[#c6c5d4]">Confidence: 0.87</p>
        </div>

        <div className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <Database className="text-green-400" size={20} />
            </div>
            <h3 className="font-headline font-bold text-[#dae2fd]">NEBULA</h3>
          </div>
          <p className="text-sm text-green-400">Operational</p>
          <p className="text-xs text-[#c6c5d4]">Certainty: 0.84</p>
        </div>
      </div>

      {/* Provenance */}
      <div className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
        <div className="flex items-center gap-3 mb-4">
          <Code className="text-[#bbc3ff]" size={20} />
          <h3 className="text-lg font-headline font-bold text-[#dae2fd]">Data Provenance</h3>
        </div>
        <div className="space-y-3">
          {[
            { source: "Salesforce", records: 1250, synced: "2 min ago" },
            { source: "HubSpot", records: 840, synced: "15 min ago" },
            { source: "CallRail", records: 3200, synced: "5 min ago" },
          ].map((src) => (
            <div key={src.source} className="flex items-center justify-between p-3 bg-[#0b1326] rounded-lg">
              <div className="flex items-center gap-3">
                <CheckCircle size={16} className="text-green-400" />
                <span className="text-sm text-[#dae2fd]">{src.source}</span>
              </div>
              <div className="text-right">
                <p className="text-sm text-[#c6c5d4]">{src.records.toLocaleString()} records</p>
                <p className="text-xs text-[#c6c5d4]/70">Synced {src.synced}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Governance */}
      <div className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
        <div className="flex items-center gap-3 mb-4">
          <Lock className="text-[#bbc3ff]" size={20} />
          <h3 className="text-lg font-headline font-bold text-[#dae2fd]">Governance Rules</h3>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 bg-[#0b1326] rounded-lg">
            <span className="text-sm text-[#dae2fd]">Score recalculation</span>
            <span className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded">Automatic</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-[#0b1326] rounded-lg">
            <span className="text-sm text-[#dae2fd]">Low confidence threshold</span>
            <span className="text-xs text-[#c6c5d4]">0.65</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-[#0b1326] rounded-lg">
            <span className="text-sm text-[#dae2fd]">Alert auto-escalation</span>
            <span className="text-xs text-[#c6c5d4]">score &lt; 60</span>
          </div>
        </div>
      </div>
    </div>
  );
}