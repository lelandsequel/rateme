// Response-timing instrumentation.
//
// Two views, one shape:
//   - repResponseTiming(repUserId)
//       avgConnectionResponseHrs:
//         For Connection rows where this rep is repUserId, status ACCEPTED
//         and respondedAt set — the mean (respondedAt − requestedAt) in
//         hours. Reflects "how fast do my buyers accept my outreach?"
//         (We use ACCEPTED only — a REJECTED connection's respondedAt isn't
//         a positive signal for the rep's pace, just buyer behavior.)
//       avgRatingFulfillmentHrs:
//         For RatingRequest rows where this rep is forRepUserId, status
//         COMPLETED, with a linked Rating — the mean (rating.createdAt −
//         request.createdAt). Reflects "how fast do raters complete the
//         rating once asked?"
//
//   - raterResponseTiming(raterUserId)
//       avgConnectionResponseHrs:
//         Connections where this rater is raterUserId, ACCEPTED, with
//         respondedAt set — same delta. "How fast do I accept rep
//         outreach?"
//       avgRatingFulfillmentHrs:
//         RatingRequests where this rater is the toRaterUserId, COMPLETED,
//         linked Rating — request.createdAt → rating.createdAt. "How fast
//         do I fulfill rating asks pointed at me?"
//
// Both helpers return null on either bucket when no rows qualify, so the
// caller can render an em-dash. Hours are rounded to one decimal — that's
// the granularity the email + dashboard cards use.
//
// We accept a `prisma`-shaped client rather than importing the project
// singleton so tests can pass an in-memory fake.

export interface TimingStats {
  /** hours from Connection.requestedAt to respondedAt, averaged. null if no responded connections. */
  avgConnectionResponseHrs: number | null;
  /** hours from RatingRequest.createdAt to ratings tied via ratingRequestId, averaged. */
  avgRatingFulfillmentHrs: number | null;
  countConnectionResponses: number;
  countRatingFulfillments: number;
}

interface ConnectionRow {
  requestedAt: Date;
  respondedAt: Date | null;
}

interface RatingRequestRow {
  createdAt: Date;
  rating: { createdAt: Date } | null;
}

interface PrismaShape {
  connection: {
    findMany: (args: {
      where: Record<string, unknown>;
      select: { requestedAt: true; respondedAt: true };
    }) => Promise<ConnectionRow[]>;
  };
  ratingRequest: {
    findMany: (args: {
      where: Record<string, unknown>;
      select: {
        createdAt: true;
        rating: { select: { createdAt: true } };
      };
    }) => Promise<RatingRequestRow[]>;
  };
}

const MS_PER_HOUR = 1000 * 60 * 60;

/**
 * Pure helper: average a list of millisecond deltas and return hours
 * rounded to 1 decimal, or null if the list is empty. Exposed for tests.
 */
export function meanHours(deltasMs: ReadonlyArray<number>): number | null {
  if (deltasMs.length === 0) return null;
  let sum = 0;
  for (const d of deltasMs) sum += d;
  const mean = sum / deltasMs.length / MS_PER_HOUR;
  return Math.round(mean * 10) / 10;
}

/**
 * Pure helper: turn raw Connection rows into (responded - requested) ms
 * deltas, dropping unresponded and clock-skew rows.
 */
export function connectionDeltasMs(
  rows: ReadonlyArray<{ requestedAt: Date; respondedAt: Date | null }>,
): number[] {
  const out: number[] = [];
  for (const c of rows) {
    if (!c.respondedAt) continue;
    const dt = new Date(c.respondedAt).getTime() - new Date(c.requestedAt).getTime();
    if (dt < 0) continue;
    out.push(dt);
  }
  return out;
}

/**
 * Pure helper: turn RatingRequest rows + their linked Rating into ms
 * deltas (rating.createdAt - request.createdAt), dropping un-fulfilled
 * and clock-skew rows.
 */
export function ratingFulfillmentDeltasMs(
  rows: ReadonlyArray<{ createdAt: Date; rating: { createdAt: Date } | null }>,
): number[] {
  const out: number[] = [];
  for (const rr of rows) {
    if (!rr.rating) continue;
    const dt =
      new Date(rr.rating.createdAt).getTime() - new Date(rr.createdAt).getTime();
    if (dt < 0) continue;
    out.push(dt);
  }
  return out;
}

async function computeTiming(
  prisma: PrismaShape,
  connectionWhere: Record<string, unknown>,
  ratingRequestWhere: Record<string, unknown>,
): Promise<TimingStats> {
  const [connections, ratingRequests] = await Promise.all([
    prisma.connection.findMany({
      where: connectionWhere,
      select: { requestedAt: true, respondedAt: true },
    }),
    prisma.ratingRequest.findMany({
      where: ratingRequestWhere,
      select: {
        createdAt: true,
        rating: { select: { createdAt: true } },
      },
    }),
  ]);

  const connDeltas = connectionDeltasMs(connections);
  const reqDeltas = ratingFulfillmentDeltasMs(ratingRequests);

  return {
    avgConnectionResponseHrs: meanHours(connDeltas),
    avgRatingFulfillmentHrs: meanHours(reqDeltas),
    countConnectionResponses: connDeltas.length,
    countRatingFulfillments: reqDeltas.length,
  };
}

export async function repResponseTiming(
  prisma: PrismaShape,
  repUserId: string,
): Promise<TimingStats> {
  return computeTiming(
    prisma,
    {
      repUserId,
      status: "ACCEPTED",
      respondedAt: { not: null },
    },
    {
      forRepUserId: repUserId,
      status: "COMPLETED",
      rating: { isNot: null },
    },
  );
}

export async function raterResponseTiming(
  prisma: PrismaShape,
  raterUserId: string,
): Promise<TimingStats> {
  return computeTiming(
    prisma,
    {
      raterUserId,
      status: "ACCEPTED",
      respondedAt: { not: null },
    },
    {
      toRaterUserId: raterUserId,
      status: "COMPLETED",
      rating: { isNot: null },
    },
  );
}

// ---------------------------------------------------------------------------
// Plain formatter for emails / cards.
// ---------------------------------------------------------------------------

export function formatHrs(hrs: number | null): string {
  if (hrs === null) return "—";
  if (hrs < 1) {
    const mins = Math.round(hrs * 60);
    return `${mins}m`;
  }
  if (hrs < 48) return `${hrs.toFixed(1)}h`;
  const days = hrs / 24;
  return `${days.toFixed(1)}d`;
}
