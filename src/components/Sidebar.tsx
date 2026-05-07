"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Group,
  UserRoundSearch,
  TrendingUp,
  Shield,
  Settings,
  HelpCircle,
  LogOut,
  LucideIcon,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const mainNav: NavItem[] = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Reps", href: "/reps", icon: Users },
  { label: "Team", href: "/team", icon: Group },
  { label: "Recruiter", href: "/recruiter", icon: UserRoundSearch },
  { label: "Benchmarks", href: "/benchmarks", icon: TrendingUp },
  { label: "Trust", href: "/trust", icon: Shield },
];

const bottomNav: NavItem[] = [
  { label: "Settings", href: "/admin", icon: Settings },
  { label: "Support", href: "/support", icon: HelpCircle },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="h-screen w-64 border-r border-[#e5e7eb] fixed left-0 top-0 flex flex-col py-6 bg-[#ffffff] z-50">
      <div className="px-6 mb-10 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#dc2626] flex items-center justify-center">
          <span className="material-symbols-outlined text-white" style={{ fontVariationSettings: "'FILL' 1;" }}>
            analytics
          </span>
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tighter text-[#0f172a] font-headline">Rate Me</h1>
          <p className="text-[10px] uppercase tracking-widest text-[#94a3b8]">Enterprise Intelligence</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-4">
        {mainNav.map((item) => {
          const isActive = item.href === "/" 
            ? pathname === "/" 
            : pathname.startsWith(item.href);
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                isActive
                  ? "bg-[#e5e7eb] text-[#dc2626] border-l-4 border-[#dc2626]"
                  : "text-[#475569] hover:text-[#0f172a] hover:bg-[#f1f5f9]"
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-4 space-y-1 border-t border-[#e5e7eb] pt-4">
        {bottomNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 px-4 py-3 text-[#475569] hover:text-[#0f172a] hover:bg-[#f1f5f9] rounded-lg transition-all duration-200"
          >
            <item.icon className="w-5 h-5" />
            <span className="text-sm font-medium">{item.label}</span>
          </Link>
        ))}

        <div className="mt-4 flex items-center gap-3 p-3 bg-[#ffffff] rounded-xl">
          <div className="w-10 h-10 rounded-full bg-[#e5e7eb] overflow-hidden">
            <div className="w-full h-full flex items-center justify-center text-[#dc2626] font-bold">
              MT
            </div>
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-bold text-[#0f172a] truncate">Marcus Thorne</p>
            <p className="text-[10px] text-[#475569] truncate">Principal Lead</p>
          </div>
        </div>
      </div>
    </aside>
  );
}