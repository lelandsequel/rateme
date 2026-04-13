import Link from "next/link";
import { Settings, Database, RefreshCw, CheckCircle, XCircle, ExternalLink } from "lucide-react";

export default function IntegrationsPage() {
  const integrations = [
    { name: "Salesforce", status: "ACTIVE", records: 1250, lastSync: "2 min ago" },
    { name: "HubSpot", status: "INACTIVE", records: 0, lastSync: "Never" },
    { name: "CallRail", status: "ACTIVE", records: 3200, lastSync: "5 min ago" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-headline font-bold text-[#dae2fd]">Data Connections</h2>
        <p className="text-[#c6c5d4] mt-1">Manage external data integrations</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {integrations.map((integration) => (
          <div key={integration.name} className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#001d92] flex items-center justify-center">
                  <Database className="text-[#bbc3ff]" size={20} />
                </div>
                <div>
                  <h3 className="font-headline font-bold text-[#dae2fd]">{integration.name}</h3>
                  <div className="flex items-center gap-1">
                    {integration.status === "ACTIVE" ? (
                      <CheckCircle size={12} className="text-green-400" />
                    ) : (
                      <XCircle size={12} className="text-[#c6c5d4]" />
                    )}
                    <span className={`text-xs ${integration.status === "ACTIVE" ? "text-green-400" : "text-[#c6c5d4]"}`}>
                      {integration.status}
                    </span>
                  </div>
                </div>
              </div>
              <button className="p-2 text-[#c6c5d4] hover:text-[#dae2fd] hover:bg-[#2d3449] rounded-lg transition-colors">
                <Settings size={18} />
              </button>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[#c6c5d4]">Records synced</span>
                <span className="text-[#dae2fd]">{integration.records.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#c6c5d4]">Last sync</span>
                <span className="text-[#dae2fd]">{integration.lastSync}</span>
              </div>
            </div>

            {integration.status === "ACTIVE" && (
              <button className="flex items-center gap-2 w-full mt-4 p-2 bg-[#0b1326] rounded-lg text-sm text-[#c6c5d4] hover:text-[#dae2fd] justify-center transition-colors">
                <RefreshCw size={14} />
                Sync Now
              </button>
            )}
          </div>
        ))}

        {/* Add New Integration */}
        <div className="bg-[#131b2e] rounded-xl p-6 border border-dashed border-[#2d3449] flex flex-col items-center justify-center min-h-[200px] cursor-pointer hover:border-[#bbc3ff]/50 transition-colors">
          <div className="w-12 h-12 rounded-full bg-[#2d3449] flex items-center justify-center mb-4">
            <span className="text-2xl text-[#c6c5d4]">+</span>
          </div>
          <p className="text-[#c6c5d4]">Add new integration</p>
        </div>
      </div>
    </div>
  );
}