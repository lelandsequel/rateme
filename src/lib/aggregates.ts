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
// Phase 9 schema rewrite: Ratings no longer carry 5 hardcoded dimension
// columns; per-question scores now live on RatingAnswer rows. The
// aggregator iterates whatever questions a rep's industry's set defines.

export type StatusTier =
  | "Unverified"
  | "Verified"
  | "Trusted"
  | "Preferred"
  | "ELITE"
  | "ELITE+";

export interface AnswerForAgg {
  score: number;
  question: {
    key: string;
    labelEn: string;
    ord: number;
  };
}

export interface RatingForAgg {
  answers: ReadonlyArray<AnswerForAgg>;
  createdAt: Date;
}

export interface PerQuestionAvg {
  key: string;
  labelEn: string;
  /** ord copied from the question — lets the UI sort the bar list. */
  ord: number;
  /** Rounded to 1 decimal, in 0-5 space. */
  avg: number;
}

export interface RepAggregates {
  ratingCount: number;
  /** Per-question averages over ALL ratings, sorted by question.ord asc. Null when no ratings. */
  perQuestion: PerQuestionAvg[] | null;
  /** Mean of (mean of all answer scores per rating) in 0-5 space. Null when no ratings. */
  overall: number | null;
  /** Headline 0-10 score = round(overall * 2 * 100) / 100 (2 decimals). Null when no ratings. */
  overall10: number | null;
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

/** Mean of the answer scores on a single rating. 0 when there are none. */
export function ratingMean(r: RatingForAgg): number {
  if (r.answers.length === 0) return 0;
  let sum = 0;
  for (const a of r.answers) sum += a.score;
  return sum / r.answers.length;
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
      perQuestion: null,
      overall: null,
      overall10: null,
      ratingsThisYear: 0,
      status: statusFromYearlyCount(0, hasAvatar),
    };
  }

  // Per-question rolling sums. We key by question.key but also remember
  // labelEn + ord for the rendered output.
  const perKey = new Map<string, { labelEn: string; ord: number; sum: number; n: number }>();

  // Overall = mean of (mean of all answer scores per rating). This way a
  // rating with 0 answers (defensive) doesn't get divided by zero, and a
  // rating with 10 answers carries the same weight as one with 5.
  let overallSum = 0;
  let overallN = 0;

  for (const r of ratings) {
    if (r.answers.length === 0) continue;
    let perRatingSum = 0;
    for (const a of r.answers) {
      perRatingSum += a.score;
      const slot = perKey.get(a.question.key);
      if (slot) {
        slot.sum += a.score;
        slot.n++;
      } else {
        perKey.set(a.question.key, {
          labelEn: a.question.labelEn,
          ord: a.question.ord,
          sum: a.score,
          n: 1,
        });
      }
    }
    overallSum += perRatingSum / r.answers.length;
    overallN++;
  }

  const overall = overallN === 0 ? null : round1(overallSum / overallN);
  const overall10 = overall === null ? null : round2(overall * 2);

  const perQuestion: PerQuestionAvg[] = Array.from(perKey.entries())
    .map(([key, slot]) => ({
      key,
      labelEn: slot.labelEn,
      ord: slot.ord,
      avg: round1(slot.sum / slot.n),
    }))
    .sort((a, b) => a.ord - b.ord);

  const ratingsThisYear = ratingsCountForStatus(ratings, now);

  return {
    ratingCount: ratings.length,
    perQuestion: perQuestion.length === 0 ? null : perQuestion,
    overall,
    overall10,
    ratingsThisYear,
    status: statusFromYearlyCount(ratingsThisYear, hasAvatar),
  };
}

/**
 * Mirror of aggregateRatings for raters: status is driven by the count of
 * ratings GIVEN by the rater, not received. Same thresholds apply. We
 * don't compute per-question averages here — raters AUTHOR ratings, the
 * dimensions vary across the reps they rate, and per-question rollups
 * for raters aren't meaningful.
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

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
