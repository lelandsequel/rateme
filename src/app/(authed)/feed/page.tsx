// /feed — recent activity in your network.
//
// Server Component. Pulls last 30 days of:
//   - Ratings where the user is the rep (incoming) or rater (outgoing).
//   - Connections involving the user (PENDING/ACCEPTED/REJECTED state changes).
//   - RatingRequests outgoing/incoming, including EXPIRED ones.
//
// Caps each source at 50/20/20 to keep the page bounded — for users with a
// huge network this matters. Then merges into a single timeline ordered
// desc by event date and groups by day with sticky day headers.
//
// Privacy: any rendered rater identity goes through publicRater() — even on
// our own outgoing ratings (where WE are the rater) we never leak OTHER
// raters' names. For our own outgoing ratings, the row shows the REP we
// rated (full name), not the rater (which is us). So the redact rule
// applies to incoming ratings (rater of someone else's rating, never us).

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HAS_DB } from "@/lib/env";
import { publicRater } from "@/lib/redact";
import {
  ConnectionStatus,
  RatingRequestStatus,
} from "@prisma/client";

export const dynamic = "force-dynamic";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Discriminated union of all timeline events. Each entry sorts on `at`.
type FeedEvent =
  | {
      kind: "rating-received";
      at: Date;
      id: string;
      raterPublic: { title: string; company: string };
      overall: number;
    }
  | {
      kind: "rating-given";
      at: Date;
      id: string;
      rep: { id: string; name: string; title: string; company: string };
      overall: number;
    }
  | {
      kind: "connection-pending";
      at: Date;
      id: string;
      otherSide: string; // "VP of Procurement @ Foo" or rep name
    }
  | {
      kind: "connection-accepted";
      at: Date;
      id: string;
      otherSide: string;
    }
  | {
      kind: "connection-rejected";
      at: Date;
      id: string;
      otherSide: string;
    }
  | {
      kind: "rating-request-completed";
      at: Date;
      id: string;
      label: string;
    }
  | {
      kind: "rating-request-expired";
      at: Date;
      id: string;
      label: string;
    }
  | {
      kind: "rating-request-pending";
      at: Date;
      id: string;
      label: string;
    };

export default async function FeedPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/feed");

  if (!HAS_DB) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Activity</h1>
        <p className="text-[#c6c5d4]">Database not configured.</p>
      </div>
    );
  }

  const userId = session.user.id;
  const since = new Date(Date.now() - THIRTY_DAYS_MS);

  const events = await loadEvents(userId, since);
  events.sort((a, b) => b.at.getTime() - a.at.getTime());

  const groups = groupByDay(events);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wider text-[#9da4c1]">Last 30 days</p>
        <h1 className="text-2xl font-bold mt-1">Activity</h1>
      </header>

      {events.length === 0 ? (
        <div className="bg-[#131b2e] rounded-xl p-6 border border-[#171f33]/50 text-[#c6c5d4]">
          Nothing yet. As you connect, give, and receive ratings, this feed will fill up.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <DayGroup key={g.label} label={g.label} events={g.events} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data loaders
// ---------------------------------------------------------------------------

async function loadEvents(userId: string, since: Date): Promise<FeedEvent[]> {
  const [
    incomingRatings,
    outgoingRatings,
    connections,
    outgoingRequests,
    incomingRequests,
  ] = await Promise.all([
    // Ratings I received (as the rep). Cap 50.
    prisma.rating.findMany({
      where: { repUserId: userId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        rater: {
          include: {
            raterProfile: {
              include: { industry: { select: { slug: true, name: true } } },
            },
          },
        },
      },
    }),

    // Ratings I gave (as the rater). Cap 50.
    prisma.rating.findMany({
      where: { raterUserId: userId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        rep: {
          include: { repProfile: true },
        },
      },
    }),

    // Connections involving me. We can't easily express "max(requestedAt,
    // respondedAt) within window" in Prisma, so we widen the SQL window to
    // 60 days and let app code filter to the actual 30-day in-window
    // events. Cap 40 here (since one user may be on either side and we
    // over-fetch slightly).
    prisma.connection.findMany({
      where: {
        OR: [{ repUserId: userId }, { raterUserId: userId }],
        requestedAt: { gte: new Date(since.getTime() - THIRTY_DAYS_MS) },
      },
      orderBy: { requestedAt: "desc" },
      take: 40,
      include: {
        rep: { include: { repProfile: true } },
        rater: {
          include: {
            raterProfile: {
              include: { industry: { select: { slug: true, name: true } } },
            },
          },
        },
      },
    }),

    // Rating requests I initiated. Cap 20.
    prisma.ratingRequest.findMany({
      where: { initiatedByUserId: userId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        forRep: { include: { repProfile: true } },
      },
    }),

    // Rating requests where I am the target rep (someone asked someone to rate me).
    prisma.ratingRequest.findMany({
      where: {
        forRepUserId: userId,
        createdAt: { gte: since },
        // Don't double-count my own initiated-for-me requests; filter out
        // initiator==self in app code.
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        forRep: { include: { repProfile: true } },
      },
    }),
  ]);

  const events: FeedEvent[] = [];

  // ---- Incoming ratings (rater REDACTED) ----
  for (const r of incomingRatings) {
    if (!r.rater.raterProfile) continue;
    const pub = publicRater({
      userId: r.rater.id,
      user: r.rater,
      title: r.rater.raterProfile.title,
      company: r.rater.raterProfile.company,
      industry: r.rater.raterProfile.industry,
    });
    events.push({
      kind: "rating-received",
      at: r.createdAt,
      id: r.id,
      raterPublic: { title: pub.title, company: pub.company },
      overall: averageOverall(r),
    });
  }

  // ---- Outgoing ratings (rep is fully visible to me, the rater) ----
  for (const r of outgoingRatings) {
    if (!r.rep.repProfile) continue;
    events.push({
      kind: "rating-given",
      at: r.createdAt,
      id: r.id,
      rep: {
        id: r.rep.id,
        name: r.rep.name,
        title: r.rep.repProfile.title,
        company: r.rep.repProfile.company,
      },
      overall: averageOverall(r),
    });
  }

  // ---- Connections ----
  // For each connection, emit one or two events:
  //   - "pending" at requestedAt (only if requestedAt >= since)
  //   - "accepted"/"rejected" at respondedAt (if status is final + respondedAt >= since)
  for (const c of connections) {
    const otherSide = describeOtherSide(c, userId);
    if (c.requestedAt >= since) {
      events.push({
        kind: "connection-pending",
        at: c.requestedAt,
        id: `${c.id}-req`,
        otherSide,
      });
    }
    if (c.respondedAt && c.respondedAt >= since) {
      if (c.status === ConnectionStatus.ACCEPTED) {
        events.push({
          kind: "connection-accepted",
          at: c.respondedAt,
          id: `${c.id}-resp`,
          otherSide,
        });
      } else if (c.status === ConnectionStatus.REJECTED) {
        events.push({
          kind: "connection-rejected",
          at: c.respondedAt,
          id: `${c.id}-resp`,
          otherSide,
        });
      }
    }
  }

  // ---- Rating requests (outgoing + incoming, dedup by id) ----
  const seenRequestIds = new Set<string>();
  const allRequests = [...outgoingRequests, ...incomingRequests];
  for (const rr of allRequests) {
    if (seenRequestIds.has(rr.id)) continue;
    seenRequestIds.add(rr.id);
    const repName = rr.forRep?.name ?? "(unknown rep)";
    const label =
      rr.forRepUserId === userId
        ? `Rating request for you${rr.toEmail ? ` (sent to ${rr.toEmail})` : ""}`
        : `Rating request for ${repName}`;
    if (rr.status === RatingRequestStatus.COMPLETED) {
      events.push({
        kind: "rating-request-completed",
        at: rr.completedAt ?? rr.createdAt,
        id: rr.id,
        label,
      });
    } else if (rr.status === RatingRequestStatus.EXPIRED) {
      // Use expiresAt as the event date if it's in window, else createdAt.
      const at = rr.expiresAt >= since ? rr.expiresAt : rr.createdAt;
      events.push({
        kind: "rating-request-expired",
        at,
        id: rr.id,
        label,
      });
    } else if (rr.status === RatingRequestStatus.PENDING) {
      events.push({
        kind: "rating-request-pending",
        at: rr.createdAt,
        id: rr.id,
        label,
      });
    }
    // CANCELLED rolls off — not interesting in a public feed.
  }

  // Trim to in-window events (some connection / request resolutions could
  // have a date stamp slightly outside the window after the date pivots).
  return events.filter((e) => e.at.getTime() >= since.getTime());
}

// Extract a human-readable label for the "other party" of a connection,
// from the perspective of the current user.
function describeOtherSide(
  c: {
    repUserId: string;
    raterUserId: string;
    rep: { id: string; name: string; repProfile: { title: string; company: string } | null };
    rater: {
      id: string;
      name: string;
      raterProfile: {
        title: string;
        company: string;
        industry: { slug: string; name: string };
      } | null;
    };
  },
  viewerId: string,
): string {
  if (c.repUserId === viewerId) {
    // I'm the rep — the other side is a rater (REDACTED).
    if (c.rater.raterProfile) {
      return `${c.rater.raterProfile.title} @ ${c.rater.raterProfile.company}`;
    }
    return "(unknown rater)";
  }
  // I'm the rater — the other side is a rep (full visibility OK).
  if (c.rep.repProfile) {
    return `${c.rep.name} (${c.rep.repProfile.title} @ ${c.rep.repProfile.company})`;
  }
  return c.rep.name;
}

function averageOverall(r: {
  responsiveness: number;
  productKnowledge: number;
  followThrough: number;
  listeningNeedsFit: number;
  trustIntegrity: number;
}): number {
  const sum =
    r.responsiveness +
    r.productKnowledge +
    r.followThrough +
    r.listeningNeedsFit +
    r.trustIntegrity;
  return Math.round((sum / 5) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Day grouping + relative time
// ---------------------------------------------------------------------------

interface DayBucket {
  label: string;
  events: FeedEvent[];
}

function groupByDay(events: ReadonlyArray<FeedEvent>): DayBucket[] {
  const buckets = new Map<string, DayBucket>();
  const now = new Date();
  const todayKey = ymd(now);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yKey = ymd(yesterday);

  for (const e of events) {
    const k = ymd(e.at);
    let label: string;
    if (k === todayKey) label = "Today";
    else if (k === yKey) label = "Yesterday";
    else label = e.at.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    let bucket = buckets.get(k);
    if (!bucket) {
      bucket = { label, events: [] };
      buckets.set(k, bucket);
    }
    bucket.events.push(e);
  }
  // Map ordering follows insertion order — which mirrors event order — desc.
  return Array.from(buckets.values());
}

function ymd(d: Date): string {
  // Local date key (not UTC) — feels right for a "today / yesterday" grouping.
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function relativeTime(d: Date, now: Date = new Date()): string {
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function DayGroup({ label, events }: DayBucket) {
  return (
    <div>
      <h2 className="sticky top-0 z-10 bg-[#0b1326]/95 backdrop-blur text-xs uppercase tracking-wider text-[#9da4c1] py-2 border-b border-[#171f33]/50">
        {label}
      </h2>
      <ul className="divide-y divide-[#171f33]/40">
        {events.map((e) => (
          <li key={`${e.kind}-${e.id}`}>
            <FeedRow event={e} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeedRow({ event }: { event: FeedEvent }) {
  const { icon, summary } = describe(event);
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="w-8 h-8 rounded-full bg-[#131b2e] border border-[#2d3449] flex items-center justify-center text-base shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-[#dae2fd]">{summary}</div>
        <div className="text-xs text-[#9da4c1] mt-0.5">{relativeTime(event.at)}</div>
      </div>
    </div>
  );
}

function describe(e: FeedEvent): { icon: string; summary: React.ReactNode } {
  switch (e.kind) {
    case "rating-received":
      return {
        icon: "★",
        summary: (
          <>
            Got rated by{" "}
            <span className="font-medium">
              {e.raterPublic.title} @ {e.raterPublic.company}
            </span>{" "}
            ({e.overall.toFixed(1)} overall)
          </>
        ),
      };
    case "rating-given":
      return {
        icon: "✎",
        summary: (
          <>
            Rated{" "}
            <Link href={`/reps/${e.rep.id}`} className="font-medium hover:underline">
              {e.rep.name}
            </Link>{" "}
            ({e.overall.toFixed(1)} overall)
          </>
        ),
      };
    case "connection-pending":
      return {
        icon: "⊕",
        summary: (
          <>
            Pending connection — <span className="font-medium">{e.otherSide}</span>
          </>
        ),
      };
    case "connection-accepted":
      return {
        icon: "✓",
        summary: (
          <>
            Connection accepted — <span className="font-medium">{e.otherSide}</span>
          </>
        ),
      };
    case "connection-rejected":
      return {
        icon: "✗",
        summary: (
          <>
            Connection declined — <span className="font-medium">{e.otherSide}</span>
          </>
        ),
      };
    case "rating-request-completed":
      return { icon: "✔", summary: <>{e.label} completed</> };
    case "rating-request-expired":
      return { icon: "⌛", summary: <>{e.label} expired</> };
    case "rating-request-pending":
      return { icon: "…", summary: <>{e.label} pending</> };
  }
}
