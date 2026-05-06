// Authed shell — gate + nav. Server Component that calls auth() to load
// the current user. The proxy.ts also enforces this for non-API pages,
// but the auth() call here is what gives us the session for the nav.

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignOutButton } from "./SignOutButton";

export const dynamic = "force-dynamic";

interface NavLink { href: string; label: string }

const NAV_BY_ROLE: Record<string, NavLink[]> = {
  REP: [
    { href: "/home", label: "Home" },
    { href: "/raters", label: "Browse Raters" },
    { href: "/connections", label: "Connections" },
  ],
  RATER: [
    { href: "/home", label: "Home" },
    { href: "/reps", label: "Browse Reps" },
    { href: "/connections", label: "Connections" },
  ],
  SALES_MANAGER: [
    { href: "/home", label: "Home" },
    { href: "/reps", label: "Browse Reps" },
    { href: "/raters", label: "Browse Raters" },
  ],
  RATER_MANAGER: [
    { href: "/home", label: "Home" },
    { href: "/raters", label: "Browse Raters" },
  ],
  ADMIN: [
    { href: "/home", label: "Home" },
    { href: "/reps", label: "Browse Reps" },
    { href: "/raters", label: "Browse Raters" },
    { href: "/connections", label: "Connections" },
  ],
};

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/home");

  const role = session.user.role ?? "REP";
  const links = NAV_BY_ROLE[role] ?? NAV_BY_ROLE.REP;

  return (
    <div className="min-h-screen bg-[#0b1326] text-[#dae2fd]">
      <nav className="border-b border-[#171f33]/50 bg-[#131b2e]">
        <div className="mx-auto max-w-6xl px-6 flex items-center justify-between py-4">
          <div className="flex items-center gap-8">
            <Link href="/home" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-[#001d92] flex items-center justify-center">
                <span className="text-[#bbc3ff] text-sm font-bold">R</span>
              </div>
              <span className="font-bold tracking-tight">RateMyRep</span>
            </Link>
            <div className="flex items-center gap-5 text-sm">
              {links.map((l) => (
                <Link key={l.href} href={l.href} className="text-[#c6c5d4] hover:text-[#dae2fd]">
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-[#c6c5d4]">
              {session.user.name ?? session.user.email} · <span className="text-[#9da4c1]">{role}</span>
            </span>
            <SignOutButton />
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
