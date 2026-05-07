/**
 * POST /api/cron/weekly-highlights
 *
 * Driven by Vercel Cron once per week (see vercel.json). Iterates ALL users
 * (paginated) and sends a per-role weekly highlight email:
 *
 *   - REP            → repHighlight     (if any ratings or any TeamMembership)
 *   - RATER          → raterHighlight   (if any connections)
 *   - SALES_MANAGER  → managerHighlight (if managing any team members)
 *   - RATER_MANAGER  → managerHighlight (if managing any team members)
 *
 * Auth: header `x-rmr-cron-secret` must match `process.env.RMR_CRON_SECRET`.
 *       Also accepts `Authorization: Bearer <RMR_CRON_SECRET>` so either
 *       Vercel cron-config style works.
 *
 * Best-effort: per-user errors are logged + counted, never thrown — the loop
 * continues so one bad row doesn't kill the run.
 *
 * Returns: { sent, skipped, failed, total } — JSON summary.
 */

import { Role, ManagerType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { HAS_DB } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import {
  repHighlight,
  raterHighlight,
  managerHighlight,
  type TeamRow,
} from "@/lib/email-templates";
import { aggregateRatings, type RatingForAgg } from "@/lib/aggregates";

const PAGE_SIZE = 200;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const expected = process.env.RMR_CRON_SECRET;
  if (!expected) {
    // No secret configured → hard 500. Better to scream than silently allow.
    return Response.json(
      { error: "RMR_CRON_SECRET is not configured" },
      { status: 500 },
    );
  }

  const headerSecret = request.headers.get("x-rmr-cron-secret");
  const authHeader = request.headers.get("authorization");
  const bearerSecret =
    authHeader && /^Bearer\s+/i.test(authHeader)
      ? authHeader.replace(/^Bearer\s+/i, "").trim()
      : null;

  const provided = headerSecret ?? bearerSecret;
  if (provided !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!HAS_DB) {
    return Response.json(
      { error: "no DB; weekly-highlights requires backend" },
      { status: 503 },
    );
  }

  const now = new Date();
  const since7 = new Date(now.getTime() - 7 * MS_PER_DAY);
  const since30 = new Date(now.getTime() - 30 * MS_PER_DAY);

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let total = 0;

  // Cursor-paginate by id for stable iteration over a large user set.
  let cursor: string | null = null;
  // Hard upper bound on iterations — defensive against runaway cursors.
  const MAX_PAGES = 10000;
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch: UserMin[] = await prisma.user.findMany({
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
      },
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    for (const u of batch) {
      total++;
      if (!u.email || !u.name) {
        skipped++;
        continue;
      }
      try {
        const result = await processUser(u, { now, since7, since30 });
        if (result === "sent") sent++;
        else skipped++;
      } catch (err) {
        failed++;
        console.error(
          `[weekly-highlights] user=${u.id} failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    if (batch.length < PAGE_SIZE) break;
  }

  return Response.json({ sent, skipped, failed, total });
}

// Vercel cron sends GET by default if you only set `path`. Allow GET as an
// alias to POST so either cron config works.
export const GET = POST;

// ---------------------------------------------------------------------------
// Per-user dispatch
// ---------------------------------------------------------------------------

interface UserMin {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl: string | null;
}

interface WindowCtx {
  now: Date;
  since7: Date;
  since30: Date;
}

async function processUser(
  user: UserMin,
  ctx: WindowCtx,
): Promise<"sent" | "skipped"> {
  switch (user.role) {
    case Role.REP:
      return processRep(user, ctx);
    case Role.RATER:
      return processRater(user, ctx);
    case Role.SALES_MANAGER:
    case Role.RATER_MANAGER:
      return processManager(user, ctx);
    default:
      return "skipped";
  }
}

async function processRep(user: UserMin, ctx: WindowCtx): Promise<"sent" | "skipped"> {
  // Profile presence is required — skip orphaned User rows
  const repProfile = await prisma.repProfile.findUnique({
    where: { userId: user.id },
    select: { title: true, company: true },
  });

  // Eligible if any ratings ever OR any team membership (so brand-new reps
  // who haven't been rated yet, but ARE on a manager's team, still get a
  // ping that nudges them into the platform).
  const [ratingsCount, membershipCount] = await Promise.all([
    prisma.rating.count({ where: { repUserId: user.id } }),
    prisma.teamMembership.count({
      where: { memberId: user.id, endedAt: null },
    }),
  ]);

  if (ratingsCount === 0 && membershipCount === 0) return "skipped";
  if (!repProfile && ratingsCount === 0) return "skipped";

  // Pull the windows of ratings we need.
  const ratings7 = await prisma.rating.findMany({
    where: { repUserId: user.id, createdAt: { gte: ctx.since7 } },
    select: ratingForAggSelect(),
  });
  const ratings30 = await prisma.rating.findMany({
    where: { repUserId: user.id, createdAt: { gte: ctx.since30 } },
    select: ratingForAggSelect(),
  });

  const msg = repHighlight(
    {
      name: user.name,
      email: user.email,
      title: repProfile?.title ?? null,
      company: repProfile?.company ?? null,
      avatarUrl: user.avatarUrl,
    },
    ratings7 as RatingForAgg[],
    ratings30 as RatingForAgg[],
  );
  const res = await sendEmail(msg);
  return res.ok ? "sent" : "skipped";
}

async function processRater(user: UserMin, ctx: WindowCtx): Promise<"sent" | "skipped"> {
  const connectionCount = await prisma.connection.count({
    where: { raterUserId: user.id },
  });
  if (connectionCount === 0) return "skipped";

  const raterProfile = await prisma.raterProfile.findUnique({
    where: { userId: user.id },
    select: { title: true, company: true },
  });

  const [given7, given30] = await Promise.all([
    prisma.rating.findMany({
      where: { raterUserId: user.id, createdAt: { gte: ctx.since7 } },
      select: { createdAt: true },
    }),
    prisma.rating.findMany({
      where: { raterUserId: user.id, createdAt: { gte: ctx.since30 } },
      select: { createdAt: true },
    }),
  ]);

  const msg = raterHighlight(
    {
      name: user.name,
      email: user.email,
      title: raterProfile?.title ?? null,
      company: raterProfile?.company ?? null,
    },
    given7,
    given30,
  );
  const res = await sendEmail(msg);
  return res.ok ? "sent" : "skipped";
}

async function processManager(user: UserMin, ctx: WindowCtx): Promise<"sent" | "skipped"> {
  const memberships = await prisma.teamMembership.findMany({
    where: { managerId: user.id, endedAt: null },
    select: {
      member: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
        },
      },
    },
  });
  if (memberships.length === 0) return "skipped";

  const managerProfile = await prisma.managerProfile.findUnique({
    where: { userId: user.id },
    select: { managesType: true, company: true },
  });

  const teamRows: TeamRow[] = [];
  for (const m of memberships) {
    const memberId = m.member.id;
    const memberName = m.member.name;
    const memberAvatar = m.member.avatarUrl;

    // Aggregate the member's last 7d / prior 23d to derive WoW change.
    const [r7, r30Prior, r30All] = await Promise.all([
      prisma.rating.findMany({
        where: { repUserId: memberId, createdAt: { gte: ctx.since7 } },
        select: ratingForAggSelect(),
      }),
      prisma.rating.findMany({
        where: {
          repUserId: memberId,
          createdAt: { gte: ctx.since30, lt: ctx.since7 },
        },
        select: ratingForAggSelect(),
      }),
      // For status calc we want all-time-ish; but our aggregate uses
      // calendar-year + grace internally — pull last 30d for the email.
      prisma.rating.findMany({
        where: { repUserId: memberId, createdAt: { gte: ctx.since30 } },
        select: ratingForAggSelect(),
      }),
    ]);

    const agg7 = aggregateRatings(r7 as RatingForAgg[], memberAvatar);
    const aggPrev = aggregateRatings(r30Prior as RatingForAgg[], memberAvatar);
    const agg30 = aggregateRatings(r30All as RatingForAgg[], memberAvatar);

    // Status drop heuristic: did the user have a "higher" status when computed
    // from all 30d vs. just the last 7d? The aggregate is calendar-year-driven,
    // so this is a coarse signal — true status drops are rare in a 7d window
    // and require a year-boundary recompute. Good enough for the weekly email.
    const tierOrder = ["Unverified", "Verified", "Trusted", "Preferred", "ELITE", "ELITE+"];
    const cur = tierOrder.indexOf(agg7.status);
    const ref = tierOrder.indexOf(agg30.status);
    const statusDropped = cur >= 0 && ref >= 0 && cur < ref;

    teamRows.push({
      name: memberName,
      ratingsThisWeek: agg7.ratingCount,
      overallNow: agg7.overall,
      overallPrev: aggPrev.overall,
      status: agg30.status,
      statusDropped,
    });
  }

  const managesType: "REP_MANAGER" | "RATER_MANAGER" =
    managerProfile?.managesType === ManagerType.RATER_MANAGER
      ? "RATER_MANAGER"
      : "REP_MANAGER";

  const msg = managerHighlight(
    {
      name: user.name,
      email: user.email,
      managesType,
      company: managerProfile?.company ?? null,
    },
    teamRows,
  );
  const res = await sendEmail(msg);
  return res.ok ? "sent" : "skipped";
}

// ---------------------------------------------------------------------------
// Shared select projection for aggregateRatings input
// ---------------------------------------------------------------------------

function ratingForAggSelect() {
  return {
    responsiveness: true,
    productKnowledge: true,
    followThrough: true,
    listeningNeedsFit: true,
    trustIntegrity: true,
    takeCallAgain: true,
    createdAt: true,
  } as const;
}
