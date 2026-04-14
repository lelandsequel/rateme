"use client";

import { Search, Bell, Settings, CircleUser } from "lucide-react";
import { Tour } from "@/components/Tour";

export function Header() {
  return (
    <header className="bg-[#0b1326] flex justify-between items-center w-full px-8 h-16 sticky top-0 z-40 border-b border-[#171f33]/30">
      <div className="flex items-center flex-1 max-w-xl">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#c6c5d4]" size={18} />
          <input
            className="w-full bg-[#060e20] border-none text-[#dae2fd] rounded-xl pl-10 pr-4 py-2 text-sm placeholder:text-[#c6c5d4]/70 focus:ring-1 focus:ring-[#bbc3ff]/30 transition-all"
            placeholder="Search reps, teams, or benchmarks..."
            type="text"
          />
        </div>
      </div>

      <div className="flex items-center gap-6 ml-8">
        <div className="flex items-center gap-2">
          <Tour />
          <button className="text-[#c6c5d4] hover:bg-[#2d3449] p-2 rounded-lg transition-colors">
            <Bell size={20} />
          </button>
          <button className="text-[#c6c5d4] hover:bg-[#2d3449] p-2 rounded-lg transition-colors">
            <Settings size={20} />
          </button>
          <button className="text-[#c6c5d4] hover:bg-[#2d3449] p-2 rounded-lg transition-colors">
            <CircleUser size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}