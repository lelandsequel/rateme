// Rating aggregates + status-tier calculator.
//
// Spec status tiers (calendar year, 90-day grace at year boundary):
//   Unverified  — signup with no avatar AND below Trusted threshold
//   Verified    — signup + picture (no rating threshold)
//   Trusted     — 25 ratings/year
//   Preferred   — 50 ratings/year
//   ELITE       — 100 ratings/year
//   ELITE+      — 500 ratings/year
//
// Once a user crosses Trusted (25), they're considered verified-by-volume
// so the avatar requirement no longer matters.
//
// We compute on read (no denormalized status field on RepProfile yet).
// The 90-day grace: e.g. ratings earned in 2025 count toward status
// through 2026-03-31; ratings from 2026 also count from Jan 1. So during
// Jan-Mar 2026 we sum (last calendar year) + (current calendar year)
// and use the larger. After Mar 31 we use only current calendar year.

export type StatusTier =
  | "Unverified"
  | "Verified"
  | "Trusted"
  | "Preferred"
  | "ELITE"
  | "ELITE+";

export interface RatingDimensions {
  responsiveness: number;
  productKnowledge: number;
  followThrough: number;
  listeningNeedsFit: number;
  trustIntegrity: number;
}

export interface RatingForAgg extends RatingDimensions {
  takeCallAgain: boolean;
  createdAt: Date;
}

export interface RepAggregates {
  ratingCount: number;
  averages: RatingDimensions | null; // null when no ratings
  takeCallAgainPct: number | null;   // 0-100, or null
  /** Average of all five dimensions — single overall score. */
  overall: number | null;
  /** Count used for the status calculation (current year + grace). */
  ratingsThisYear: number;
  status: StatusTier;
}

export interface RaterAggregates {
  ratingsGivenCount: number;
  ratingsGivenThisYear: number;
  status: StatusTier;
}

const STATUS_THRESHOLDS: Array<[StatusTier, number]> = [
  ["ELITE+", 500],
  ["ELITE", 100],
  ["Preferred", 50],
  ["Trusted", 25],
];

/**
 * Determine status from a yearly rating count. Users below Trusted (25) and
 * without an avatar are Unverified; otherwise the floor is Verified.
 */
export function statusFromYearlyCount(count: number, hasAvatar: boolean): StatusTier {
  for (const [tier, threshold] of STATUS_THRESHOLDS) {
    if (count >= threshold) return tier;
  }
  return hasAvatar ? "Verified" : "Unverified";
}

/**
 * Sum ratings in the current calendar year, with 90-day grace from the
 * prior year (Jan-Mar carryover). Returns the count that should drive
 * status.
 */
export function ratingsCountForStatus(
  ratings: ReadonlyArray<{ createdAt: Date }>,
  now: Date = new Date(),
): number {
  const currentYear = now.getUTCFullYear();
  const inGracePeriod = now.getUTCMonth() <= 2; // Jan(0), Feb(1), Mar(2)

  let current = 0;
  let prior = 0;
  for (const r of ratings) {
    const y = new Date(r.createdAt).getUTCFullYear();
    if (y === currentYear) current++;
    else if (y === currentYear - 1) prior++;
  }

  if (!inGracePeriod) return current;
  return Math.max(current, current + prior); // grace: keep prior if we still benefit
}

export function aggregateRatings(
  ratings: ReadonlyArray<RatingForAgg>,
  avatarUrl: string | null,
  now: Date = new Date(),
): RepAggregates {
  const hasAvatar = !!avatarUrl;

  if (ratings.length === 0) {
    return {
      ratingCount: 0,
      averages: null,
      takeCallAgainPct: null,
      overall: null,
      ratingsThisYear: 0,
      status: statusFromYearlyCount(0, hasAvatar),
    };
  }

  const sums: RatingDimensions = {
    responsiveness: 0,
    productKnowledge: 0,
    followThrough: 0,
    listeningNeedsFit: 0,
    trustIntegrity: 0,
  };
  let yes = 0;
  for (const r of ratings) {
    sums.responsiveness += r.responsiveness;
    sums.productKnowledge += r.productKnowledge;
    sums.followThrough += r.followThrough;
    sums.listeningNeedsFit += r.listeningNeedsFit;
    sums.trustIntegrity += r.trustIntegrity;
    if (r.takeCallAgain) yes++;
  }
  const n = ratings.length;
  const averages: RatingDimensions = {
    responsiveness:    round1(sums.responsiveness / n),
    productKnowledge:  round1(sums.productKnowledge / n),
    followThrough:     round1(sums.followThrough / n),
    listeningNeedsFit: round1(sums.listeningNeedsFit / n),
    trustIntegrity:    round1(sums.trustIntegrity / n),
  };
  const overall = round1(
    (averages.responsiveness + averages.productKnowledge + averages.followThrough + averages.listeningNeedsFit + averages.trustIntegrity) / 5,
  );
  const ratingsThisYear = ratingsCountForStatus(ratings, now);

  return {
    ratingCount: n,
    averages,
    takeCallAgainPct: Math.round((yes / n) * 100),
    overall,
    ratingsThisYear,
    status: statusFromYearlyCount(ratingsThisYear, hasAvatar),
  };
}

/**
 * Mirror of aggregateRatings for raters: status is driven by the count of
 * ratings GIVEN by the rater, not received. Same thresholds apply.
 */
export function aggregateRaterRatings(
  ratingsGiven: ReadonlyArray<{ createdAt: Date }>,
  avatarUrl: string | null,
  now: Date = new Date(),
): RaterAggregates {
  const hasAvatar = !!avatarUrl;
  const ratingsGivenThisYear = ratingsCountForStatus(ratingsGiven, now);
  return {
    ratingsGivenCount: ratingsGiven.length,
    ratingsGivenThisYear,
    status: statusFromYearlyCount(ratingsGivenThisYear, hasAvatar),
  };
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
