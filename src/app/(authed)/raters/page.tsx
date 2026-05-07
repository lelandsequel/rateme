// Browse the rater directory — REDACTED. Title + company + industry only.

import Link from "next/link";
import { auth } from "@/lib/auth";
import { Role, USState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ConnectRaterButton } from "./ConnectRaterButton";

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  industry?: string;
  state?: string;
}

export default async function RatersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() || null;
  const industrySlug = sp.industry || null;
  const state = sp.state?.toUpperCase() || null;
  const session = await auth();
  const viewerIsRep = session?.user?.role === Role.REP;
  const viewerId = session?.user?.id ?? "";

  const [industries, raters] = await Promise.all([
    prisma.industry.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true } }),
    prisma.raterProfile.findMany({
      where: {
        ...(industrySlug ? { industry: { slug: industrySlug } } : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { company: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(state && (Object.values(USState) as string[]).includes(state)
          ? { user: { state: state as USState } }
          : {}),
      },
      take: 50,
      include: {
        user: { select: { id: true, state: true } },
        industry: { select: { name: true, slug: true } },
      },
      orderBy: { user: { createdAt: "desc" } },
    }),
  ]);

  // For reps: bulk-fetch existing connections so we can render correct CTAs.
  let myConnectionRaterIds = new Set<string>();
  if (viewerIsRep && viewerId) {
    const conns = await prisma.connection.findMany({
      where: { repUserId: viewerId },
      select: { raterUserId: true },
    });
    myConnectionRaterIds = new Set(conns.map((c) => c.raterUserId));
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wider text-[#94a3b8]">Directory · privacy on</p>
        <h1 className="text-3xl font-bold mt-1">Browse Raters</h1>
        <p className="text-[#475569]">Only title and company are visible. Names and contact info are hidden.</p>
      </header>

      <form className="flex flex-wrap gap-3 items-end bg-[#ffffff] p-4 rounded-lg border border-[#e5e7eb]">
        <FilterInput label="Search" name="q" defaultValue={q ?? ""} placeholder="title or company" />
        <FilterSelect label="Industry" name="industry" defaultValue={industrySlug ?? ""}>
          <option value="">All industries</option>
          {industries.map((i) => <option key={i.slug} value={i.slug}>{i.name}</option>)}
        </FilterSelect>
        <FilterInput label="State" name="state" defaultValue={state ?? ""} placeholder="TX" />
        <button type="submit" className="px-4 py-2 rounded-lg bg-[#dc2626] text-[#ffffff] text-sm font-medium hover:bg-[#b91c1c]">
          Filter
        </button>
        {(q || industrySlug || state) && (
          <Link href="/raters" className="text-sm text-[#94a3b8] hover:text-[#0f172a]">Clear</Link>
        )}
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {raters.map((r) => (
          <div key={r.userId} className="bg-[#ffffff] rounded-lg border border-[#e5e7eb] p-4 flex items-start justify-between">
            <div>
              <div className="font-bold text-[#0f172a]">{r.title}</div>
              <div className="text-sm text-[#475569]">{r.company}</div>
              <div className="text-xs text-[#94a3b8] mt-1">{r.industry.name} · {r.user.state}</div>
            </div>
            {viewerIsRep && !myConnectionRaterIds.has(r.userId) && (
              <ConnectRaterButton raterUserId={r.userId} />
            )}
            {viewerIsRep && myConnectionRaterIds.has(r.userId) && (
              <span className="text-xs text-[#94a3b8]">Already connected</span>
            )}
          </div>
        ))}
        {raters.length === 0 && <p className="text-[#94a3b8]">No raters match those filters.</p>}
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
