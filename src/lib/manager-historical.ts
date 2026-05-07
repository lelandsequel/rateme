// Monthly historical aggregates for the manager dashboard.
//
// Pure-functional. The API route hydrates ratings + memberships then calls
// into here. "Now" is injectable for testability.

export interface MonthlyBucket {
  /** First day of the month (UTC midnight). */
  monthStart: Date;
  /** Mean of (mean of 5 dims) across all ratings in the bucket. Null if empty. */
  avgOverall: number | null;
  ratingCount: number;
}

export interface MemberDelta {
  memberId: string;
  name: string;
  avgOverallThisMonth: number | null;
  avgOverallLastMonth: number | null;
  /** Absolute delta (current - prior). Null if either side missing. */
  delta: number | null;
  /** Percent change. Null if prior is null/0. */
  deltaPct: number | null;
}

interface DimRow {
  responsiveness: number;
  productKnowledge: number;
  followThrough: number;
  listeningNeedsFit: number;
  trustIntegrity: number;
  createdAt: Date;
}

function overall(r: DimRow): number {
  return (
    r.responsiveness +
    r.productKnowledge +
    r.followThrough +
    r.listeningNeedsFit +
    r.trustIntegrity
  ) / 5;
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function startOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

/**
 * Build N monthly buckets ending with the current month, ordered oldest →
 * newest. Each bucket holds avgOverall (mean of 5 dims, mean over all
 * ratings in the bucket) and ratingCount.
 */
export function monthlyTeamAggregates<R extends DimRow>(
  ratings: ReadonlyArray<R>,
  monthsBack: number = 12,
  now: Date = new Date(),
): MonthlyBucket[] {
  const currentMonth = startOfMonthUTC(now);
  const oldestMonth = addMonths(currentMonth, -(monthsBack - 1));

  const buckets: Array<{ monthStart: Date; sum: number; count: number }> = [];
  for (let i = 0; i < monthsBack; i++) {
    buckets.push({
      monthStart: addMonths(oldestMonth, i),
      sum: 0,
      count: 0,
    });
  }

  for (const r of ratings) {
    const m = startOfMonthUTC(new Date(r.createdAt));
    if (m < oldestMonth || m > currentMonth) continue;
    const idx =
      (m.getUTCFullYear() - oldestMonth.getUTCFullYear()) * 12 +
      (m.getUTCMonth() - oldestMonth.getUTCMonth());
    if (idx < 0 || idx >= monthsBack) continue;
    buckets[idx].sum += overall(r);
    buckets[idx].count++;
  }

  return buckets.map((b) => ({
    monthStart: b.monthStart,
    avgOverall: b.count > 0 ? round1(b.sum / b.count) : null,
    ratingCount: b.count,
  }));
}

/**
 * Per-member current-month-vs-prior-month deltas. Each member entry
 * carries name + this-month + last-month + absolute delta + percent delta.
 * Members with no ratings in either window still appear (with nulls).
 */
export function memberMonthlyDeltas<R extends DimRow & { memberId: string }>(
  ratingsWithMember: ReadonlyArray<R>,
  members: ReadonlyArray<{ id: string; name: string }>,
  now: Date = new Date(),
): MemberDelta[] {
  const currentMonth = startOfMonthUTC(now);
  const lastMonth = addMonths(currentMonth, -1);

  function avgFor(memberId: string, fromInclusive: Date, toExclusive: Date): number | null {
    let sum = 0;
    let n = 0;
    for (const r of ratingsWithMember) {
      if (r.memberId !== memberId) continue;
      const t = new Date(r.createdAt);
      if (t < fromInclusive || t >= toExclusive) continue;
      sum += overall(r);
      n++;
    }
    return n === 0 ? null : round1(sum / n);
  }

  const nextMonthAfterCurrent = addMonths(currentMonth, 1);
  return members.map((m) => {
    const current = avgFor(m.id, currentMonth, nextMonthAfterCurrent);
    const prior = avgFor(m.id, lastMonth, currentMonth);
    const delta =
      current !== null && prior !== null ? round1(current - prior) : null;
    const deltaPct =
      current !== null && prior !== null && prior !== 0
        ? round1(((current - prior) / prior) * 100)
        : null;
    return {
      memberId: m.id,
      name: m.name,
      avgOverallThisMonth: current,
      avgOverallLastMonth: prior,
      delta,
      deltaPct,
    };
  });
}
