// Browse / search the rep directory.

import Link from "next/link";
import { Role, USState } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aggregateRatings } from "@/lib/aggregates";
import { FavoriteToggle } from "./[id]/FavoriteToggle";

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  industry?: string;
  state?: string;
}

export default async function RepsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (session?.user?.role === Role.REP) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Reps don&apos;t browse other reps</h1>
        <p className="text-[#475569]">
          Try <Link href="/raters" className="underline hover:text-[#dc2626]">/raters</Link> or{" "}
          <Link href="/home" className="underline hover:text-[#dc2626]">/home</Link>.
        </p>
      </div>
    );
  }

  const sp = await searchParams;
  const q = sp.q?.trim() || null;
  const industrySlug = sp.industry || null;
  const state = sp.state?.toUpperCase() || null;

  const viewerIsRater = session?.user?.role === Role.RATER;
  const viewerId = session?.user?.id ?? null;

  const [industries, reps, favoriteRows] = await Promise.all([
    prisma.industry.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true } }),
    prisma.user.findMany({
      where: {
        role: Role.REP,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { repProfile: { company: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
        ...(industrySlug ? { repProfile: { industry: { slug: industrySlug } } } : {}),
        ...(state && (Object.values(USState) as string[]).includes(state)
          ? { state: state as USState }
          : {}),
      },
      orderBy: { name: "asc" },
      take: 50,
      select: {
        id: true,
        name: true,
        state: true,
        avatarUrl: true,
        repProfile: {
          select: {
            title: true,
            company: true,
            metroArea: true,
            industry: { select: { slug: true, name: true } },
          },
        },
        ratingsReceived: {
          select: {
            responsiveness: true,
            productKnowledge: true,
            followThrough: true,
            listeningNeedsFit: true,
            trustIntegrity: true,
            takeCallAgain: true,
            createdAt: true,
          },
        },
      },
    }),
    viewerIsRater && viewerId
      ? prisma.favorite.findMany({
          where: { raterUserId: viewerId },
          select: { repUserId: true },
        })
      : Promise.resolve([] as Array<{ repUserId: string }>),
  ]);

  const favoriteSet = new Set(favoriteRows.map((f) => f.repUserId));

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wider text-[#94a3b8]">Directory</p>
        <h1 className="text-3xl font-bold mt-1">Browse Reps</h1>
        <p className="text-[#475569]">All rep info is public.</p>
      </header>

      <form className="flex flex-wrap gap-3 items-end bg-[#ffffff] p-4 rounded-lg border border-[#e5e7eb]">
        <FilterInput label="Search" name="q" defaultValue={q ?? ""} placeholder="name or company" />
        <FilterSelect label="Industry" name="industry" defaultValue={industrySlug ?? ""}>
          <option value="">All industries</option>
          {industries.map((i) => <option key={i.slug} value={i.slug}>{i.name}</option>)}
        </FilterSelect>
        <FilterInput label="State" name="state" defaultValue={state ?? ""} placeholder="TX" />
        <button type="submit" className="px-4 py-2 rounded-lg bg-[#dc2626] text-[#ffffff] text-sm font-medium hover:bg-[#b91c1c]">
          Filter
        </button>
        {(q || industrySlug || state) && (
          <Link href="/reps" className="text-sm text-[#94a3b8] hover:text-[#0f172a] underline-offset-2 hover:underline">
            Clear
          </Link>
        )}
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {reps.filter((r) => r.repProfile).map((r) => {
          const agg = aggregateRatings(r.ratingsReceived, r.avatarUrl);
          return (
            <Link
              key={r.id}
              href={`/reps/${r.id}`}
              className="bg-white rounded-lg border border-[#e5e7eb] p-4 hover:border-[#fecaca] shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="font-bold text-[#0f172a]">{r.name}</div>
                  <div className="text-sm text-[#475569]">{r.repProfile!.title} · {r.repProfile!.company}</div>
                  <div className="text-xs text-[#94a3b8] mt-1">
                    {r.repProfile!.industry.name} · {r.repProfile!.metroArea ?? r.state}
                  </div>
                  <div className="text-sm mt-2 text-[#0f172a]">
                    <span className="text-[#fbbf24] mr-1">★</span>
                    <span className="font-semibold">{agg.overall ?? "—"}</span>
                    <span className="text-[#94a3b8] ml-1">
                      · {agg.ratingCount} {agg.ratingCount === 1 ? "rating" : "ratings"}
                    </span>
                  </div>
                </div>
                {viewerIsRater && (
                  <FavoriteToggle
                    repUserId={r.id}
                    initialFavorited={favoriteSet.has(r.id)}
                    size="sm"
                  />
                )}
              </div>
            </Link>
          );
        })}
        {reps.length === 0 && <p className="text-[#94a3b8]">No reps match those filters.</p>}
      </div>
    </div>
  );
}

function FilterInput({ label, name, defaultValue, placeholder }: { label: string; name: string; defaultValue?: string; placeholder?: string }) {
  return (
    <label className="flex flex-col text-xs text-[#94a3b8]">
      {label}
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-1 bg-[#ffffff] text-[#0f172a] px-3 py-2 rounded-lg border border-[#e5e7eb] text-sm w-40"
      />
    </label>
  );
}

function FilterSelect({ label, name, defaultValue, children }: { label: string; name: string; defaultValue?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col text-xs text-[#94a3b8]">
      {label}
      <select name={name} defaultValue={defaultValue} className="mt-1 bg-[#ffffff] text-[#0f172a] px-3 py-2 rounded-lg border border-[#e5e7eb] text-sm">
        {children}
      </select>
    </label>
  );
}
