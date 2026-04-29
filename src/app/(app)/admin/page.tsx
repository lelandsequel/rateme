export const dynamic = 'force-dynamic'

const HAS_DB = !!process.env.DATABASE_URL;

import { Settings, Users, Building, Bell, Palette, Shield } from "lucide-react";

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-headline font-bold text-[#dae2fd]">Tenant Settings</h2>
        <p className="text-[#c6c5d4] mt-1">Configure your organization</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
          <div className="flex items-center gap-3 mb-4">
            <Settings className="text-[#bbc3ff]" size={20} />
            <h3 className="text-lg font-headline font-bold text-[#dae2fd]">General</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-[#c6c5d4] block mb-1">Organization Name</label>
              <input className="w-full bg-[#0b1326] text-[#dae2fd] px-3 py-2 rounded-lg border border-[#2d3449]" defaultValue="Demo Enterprise" />
            </div>
            <div>
              <label className="text-sm text-[#c6c5d4] block mb-1">Timezone</label>
              <select className="w-full bg-[#0b1326] text-[#dae2fd] px-3 py-2 rounded-lg border border-[#2d3449]">
                <option>America/Chicago</option>
                <option>America/New_York</option>
                <option>America/Los_Angeles</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="text-[#bbc3ff]" size={20} />
            <h3 className="text-lg font-headline font-bold text-[#dae2fd]">Security</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-[#0b1326] rounded-lg">
              <span className="text-sm text-[#dae2fd]">Two-Factor Auth</span>
              <input type="checkbox" className="w-4 h-4" defaultChecked />
            </div>
            <div className="flex items-center justify-between p-3 bg-[#0b1326] rounded-lg">
              <span className="text-sm text-[#dae2fd]">SSO Enabled</span>
              <input type="checkbox" className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}