"use client";

import { Search, Bell, Settings, CircleUser } from "lucide-react";
import { Tour } from "@/components/Tour";

export function Header() {
  return (
    <header className="bg-[#ffffff] flex justify-between items-center w-full px-8 h-16 sticky top-0 z-40 border-b border-[#e5e7eb]">
      <div className="flex items-center flex-1 max-w-xl">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#475569]" size={18} />
          <input
            className="w-full bg-[#f8fafc] border-none text-[#0f172a] rounded-xl pl-10 pr-4 py-2 text-sm placeholder:text-[#94a3b8] focus:ring-1 focus:ring-[#dc2626]/30 transition-all"
            placeholder="Search reps, teams, or benchmarks..."
            type="text"
          />
        </div>
      </div>

      <div className="flex items-center gap-6 ml-8">
        <div className="flex items-center gap-2">
          <Tour />
          <button className="text-[#475569] hover:bg-[#e5e7eb] p-2 rounded-lg transition-colors">
            <Bell size={20} />
          </button>
          <button className="text-[#475569] hover:bg-[#e5e7eb] p-2 rounded-lg transition-colors">
            <Settings size={20} />
          </button>
          <button className="text-[#475569] hover:bg-[#e5e7eb] p-2 rounded-lg transition-colors">
            <CircleUser size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}