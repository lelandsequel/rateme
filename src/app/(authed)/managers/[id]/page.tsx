// Manager profile page — public-facing identity backing the link on each
// rep profile. SALES_MANAGER pages list the manager's reps; RATER_MANAGER
// pages list redacted raters (title + company only).

import Link from "next/link";
import { Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { publicRater } from "@/lib/redact";

export const dynamic = "force-dynamic";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export default async function ManagerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const manager = await prisma.user.findUnique({
    where: { id },
    include: { managerProfile: true },
  });

  const isManager =
    !!manager &&
    (manager.role === Role.SALES_MANAGER ||
      manager.role === Role.RATER_MANAGER) &&
    !!manager.managerProfile;

  if (!isManager) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Manager not found</h1>
      </div>
    );
  }

  const memberships = await prisma.teamMembership.findMany({
    where: {
      managerId: manager.id,
      endedAt: null,
      acceptedAt: { not: null },
    },
    include: {
      member: {
        include: {
          repProfile: {
            include: { industry: { select: { slug: true, name: true } } },
          },
          raterProfile: {
            include: { industry: { select: { slug: true, name: true } } },
          },
        },
      },
    },
    orderBy: { acceptedAt: "asc" },
  });

  const teamSize = memberships.length;
  const memberIds = memberships.map((m) => m.member.id);
  const since = new Date(Date.now() - NINETY_DAYS_MS);

  let avgOverall: number | null = null;
  let ratingsLast90d = 0;

  const isSalesManager = manager.managerProfile!.managesType === "REP_MANAGER";

  if (memberIds.length > 0) {
    if (isSalesManager) {
      const ratings = await prisma.rating.findMany({
        where: { repUserId: { in: memberIds }, createdAt: { gte: since } },
        select: {
          responsiveness: true,
          productKnowledge: true,
          followThrough: true,
          listeningNeedsFit: true,
          trustIntegrity: true,
        },
      });
      ratingsLast90d = ratings.length;
      if (ratings.length > 0) {
        const total = ratings.reduce(
          (acc, r) =>
            acc +
            r.responsiveness +
            r.productKnowledge +
            r.followThrough +
            r.listeningNeedsFit +
            r.trustIntegrity,
          0,
        );
        avgOverall = Math.round((total / (ratings.length * 5)) * 10) / 10;
      }
    } else {
      ratingsLast90d = await prisma.rating.count({
        where: { raterUserId: { in: memberIds }, createdAt: { gte: since } },
      });
    }
  }

  const roleLabel = isSalesManager ? "Sales Manager" : "Rater Manager";

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-[#94a3b8]">
            Manager profile
          </p>
          <h1 className="text-3xl font-bold mt-1">{manager.name}</h1>
          <p className="text-[#475569]">
            {roleLabel}
            {manager.managerProfile!.company
              ? ` · ${manager.managerProfile!.company}`
              : ""}
          </p>
          <p className="text-xs text-[#94a3b8] mt-1">
            {manager.state} · member since{" "}
            {new Date(manager.createdAt).toLocaleDateString()}
          </p>
          <p className="text-xs text-[#94a3b8] mt-1">{manager.email}</p>
        </div>
        <span className="px-3 py-1 rounded bg-[#e0f2fe] text-[#075985] text-sm">
          {roleLabel}
        </span>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat label="Team size" value={teamSize} />
        {isSalesManager ? (
          <Stat label="Avg score (90d)" value={avgOverall ?? "—"} />
        ) : null}
        <Stat
          label={isSalesManager ? "Ratings (90d)" : "Ratings given (90d)"}
          value={ratingsLast90d}
        />
      </div>

      <div>
        <h2 className="font-bold mb-3">
          {isSalesManager ? "Reps" : "Raters"} ({teamSize})
        </h2>
        {memberships.length === 0 ? (
          <p className="text-[#94a3b8]">No active team members.</p>
        ) : isSalesManager ? (
          <ul className="space-y-2">
            {memberships
              .filter((m) => m.member.repProfile)
              .map((m) => (
                <li
                  key={m.id}
                  className="bg-[#ffffff] rounded-lg border border-[#e5e7eb] p-4"
                >
                  <Link
                    href={`/reps/${m.member.id}`}
                    className="block hover:text-[#dc2626]"
                  >
                    <div className="font-bold text-[#0f172a]">
                      {m.member.name}
                    </div>
                    <div className="text-sm text-[#475569]">
                      {m.member.repProfile!.company} ·{" "}
                      {m.member.repProfile!.industry.name}
                    </div>
                  </Link>
                </li>
              ))}
          </ul>
        ) : (
          <ul className="space-y-2">
            {memberships
              .filter((m) => m.member.raterProfile)
              .map((m) => {
                const pr = publicRater({
                  userId: m.member.id,
                  user: m.member,
                  title: m.member.raterProfile!.title,
                  company: m.member.raterProfile!.company,
                  industry: m.member.raterProfile!.industry,
                });
                return (
                  <li
                    key={m.id}
                    className="bg-[#ffffff] rounded-lg border border-[#e5e7eb] p-4"
                  >
                    <div className="text-sm text-[#0f172a]">
                      {pr.title} · {pr.company}
                    </div>
                    <div className="text-xs text-[#94a3b8] mt-1">
                      {pr.industry.name} · {pr.state}
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="bg-[#ffffff] rounded-lg border border-[#e5e7eb] p-4">
      <div className="text-xs uppercase tracking-wider text-[#94a3b8]">
        {label}
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
