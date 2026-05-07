// /me — the current user's self-view.
//
// Shows name, role, profile fields, status badge (computed via
// aggregateRatings / aggregateRaterRatings), and a link to /me/edit.

import Link from "next/link";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HAS_DB } from "@/lib/env";
import {
  aggregateRatings,
  aggregateRaterRatings,
  type StatusTier,
} from "@/lib/aggregates";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/me");

  if (!HAS_DB) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Profile unavailable</h1>
        <p className="text-[#c6c5d4]">Database not configured. Mock-mode shell.</p>
      </div>
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      repProfile: { include: { industry: { select: { slug: true, name: true } } } },
      raterProfile: { include: { industry: { select: { slug: true, name: true } } } },
      managerProfile: true,
    },
  });
  if (!user) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Account missing</h1>
        <p className="text-[#c6c5d4]">Your user row was deleted. Sign out and sign back in.</p>
      </div>
    );
  }

  // Compute status — only meaningful for REP / RATER. Managers/Admin show no
  // status badge.
  let status: StatusTier | null = null;
  if (user.role === Role.REP) {
    const ratings = await prisma.rating.findMany({
      where: { repUserId: user.id },
      select: {
        responsiveness: true,
        productKnowledge: true,
        followThrough: true,
        listeningNeedsFit: true,
        trustIntegrity: true,
        takeCallAgain: true,
        createdAt: true,
      },
    });
    status = aggregateRatings(ratings, user.avatarUrl).status;
  } else if (user.role === Role.RATER) {
    const ratings = await prisma.rating.findMany({
      where: { raterUserId: user.id },
      select: { createdAt: true },
    });
    status = aggregateRaterRatings(ratings, user.avatarUrl).status;
  }

  const initial = (user.name?.trim()?.[0] ?? "?").toUpperCase();

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Me</h1>
        <div className="flex items-center gap-2">
          <a
            href="/api/me/export"
            download
            className="text-sm bg-[#131b2e] border border-[#2d3449] text-[#c6c5d4] px-3 py-1.5 rounded-lg hover:text-[#dae2fd]"
            title="Download a JSON snapshot of all your data"
          >
            Download my data
          </a>
          <Link
            href="/me/edit"
            className="text-sm bg-[#bbc3ff] text-[#0b1326] px-3 py-1.5 rounded-lg font-medium hover:bg-[#bbc3ff]/80"
          >
            Edit profile
          </Link>
        </div>
      </div>

      <section className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50">
        <div className="flex items-center gap-4">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatarUrl}
              alt={user.name}
              className="w-16 h-16 rounded-full object-cover border border-[#2d3449] bg-[#0b1326]"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-[#001d92] flex items-center justify-center text-[#bbc3ff] text-xl font-bold">
              {initial}
            </div>
          )}
          <div className="flex-1">
            <div className="text-lg font-semibold">{user.name}</div>
            <div className="text-sm text-[#c6c5d4]">{user.email}</div>
            <div className="text-xs text-[#9da4c1] mt-1">
              {user.role} · {user.state}
            </div>
          </div>
          {status && <StatusBadge status={status} />}
        </div>
      </section>

      <section className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50 space-y-2 text-sm">
        <h2 className="text-base font-semibold mb-2">Profile</h2>
        {user.repProfile && (
          <>
            <Row label="Title" value={user.repProfile.title} />
            <Row label="Company" value={user.repProfile.company} />
            <Row label="Industry" value={user.repProfile.industry.name} />
            <Row
              label="Metro area"
              value={user.repProfile.metroArea ?? "—"}
            />
          </>
        )}
        {user.raterProfile && (
          <>
            <Row label="Title" value={user.raterProfile.title} />
            <Row label="Company" value={user.raterProfile.company} />
            <Row label="Industry" value={user.raterProfile.industry.name} />
          </>
        )}
        {user.managerProfile && (
          <>
            <Row label="Manages" value={user.managerProfile.managesType} />
            <Row label="Company" value={user.managerProfile.company} />
          </>
        )}
        {!user.repProfile && !user.raterProfile && !user.managerProfile && (
          <p className="text-[#9da4c1]">No profile fields for this role.</p>
        )}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 border-b border-[#171f33]/30 last:border-0">
      <span className="text-[#9da4c1]">{label}</span>
      <span className="text-[#dae2fd]">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: StatusTier }) {
  const tone: Record<StatusTier, string> = {
    Unverified: "bg-[#2d3449] text-[#9da4c1]",
    Verified: "bg-[#1a3358] text-[#bbc3ff]",
    Trusted: "bg-[#1d4d3a] text-[#9be7c4]",
    Preferred: "bg-[#3a2a5a] text-[#d3b8ff]",
    ELITE: "bg-[#5a3000] text-[#ffd098]",
    "ELITE+": "bg-[#7a1a40] text-[#ffb0d0]",
  };
  return (
    <span className={`text-xs font-medium px-2 py-1 rounded-md ${tone[status]}`}>
      {status}
    </span>
  );
}
