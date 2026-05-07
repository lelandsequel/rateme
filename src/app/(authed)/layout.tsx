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
    { href: "/team", label: "Team" },
    { href: "/me", label: "Me" },
  ],
  RATER: [
    { href: "/home", label: "Home" },
    { href: "/reps", label: "Browse Reps" },
    { href: "/favorites", label: "Favorites" },
    { href: "/connections", label: "Connections" },
    { href: "/team", label: "Team" },
    { href: "/me", label: "Me" },
  ],
  SALES_MANAGER: [
    { href: "/home", label: "Home" },
    { href: "/reps", label: "Browse Reps" },
    { href: "/raters", label: "Browse Raters" },
    { href: "/team", label: "Team" },
    { href: "/me", label: "Me" },
  ],
  RATER_MANAGER: [
    { href: "/home", label: "Home" },
    { href: "/raters", label: "Browse Raters" },
    { href: "/team", label: "Team" },
    { href: "/me", label: "Me" },
  ],
  ADMIN: [
    { href: "/home", label: "Home" },
    { href: "/reps", label: "Browse Reps" },
    { href: "/raters", label: "Browse Raters" },
    { href: "/connections", label: "Connections" },
    { href: "/me", label: "Me" },
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
            <Link href="/me" className="flex items-center gap-2 group">
              <AvatarBadge
                avatarUrl={session.user.avatarUrl ?? null}
                name={session.user.name ?? session.user.email ?? "?"}
              />
              <span className="text-[#c6c5d4] group-hover:text-[#dae2fd]">
                {session.user.name ?? session.user.email} ·{" "}
                <span className="text-[#9da4c1]">{role}</span>
              </span>
            </Link>
            <SignOutButton />
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

function AvatarBadge({
  avatarUrl,
  name,
}: {
  avatarUrl: string | null;
  name: string;
}) {
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();
  if (avatarUrl) {
    // Plain <img> on purpose — Supabase public URLs aren't on the
    // next/image allow-list and we don't want to add a remotePatterns
    // entry just for this. The image is small (header circle).
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name}
        className="w-7 h-7 rounded-full object-cover bg-[#0b1326] border border-[#2d3449]"
      />
    );
  }
  return (
    <div className="w-7 h-7 rounded-full bg-[#001d92] flex items-center justify-center text-[#bbc3ff] text-xs font-bold">
      {initial}
    </div>
  );
}
