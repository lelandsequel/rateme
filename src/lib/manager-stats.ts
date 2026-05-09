// Pure aggregation helpers for the manager dashboard.
//
// All inputs are plain rating-shaped records with a `createdAt`. No DB
// access — the API route hydrates rows then calls into here. "Now" is
// always injectable so callers (and tests) can pin time.
//
// Phase 9 schema rewrite: ratings carry dynamic per-question answers,
// not 5 fixed dimension columns. Each helper takes rows that expose
// `answers: Array<{ score, question: { key, labelEn, ord } }>` (the
// shape Prisma returns when you `include: { answers: { include:
// { question: true } } }`). We compute "score per rating" as the mean
// of that rating's answer scores, then aggregate from there.

export interface MonthOverMonth {
  thisMonth: number;
  lastMonth: number;
  /** Percent change from lastMonth → thisMonth. Null when lastMonth is 0. */
  deltaPct: number | null;
}

export interface AnswerWithQuestion {
  score: number;
  question: { key: string; labelEn: string; ord: number };
}

export interface AnswersRow {
  answers: ReadonlyArray<AnswerWithQuestion>;
  createdAt: Date;
}

export interface AnswersPairRow extends AnswersRow {
  repUserId: string;
  raterUserId: string;
}

interface TimedRow {
  createdAt: Date;
}

interface RepRow extends TimedRow {
  repUserId: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function startOfPrevMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
}

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function deltaPct(thisMonth: number, lastMonth: number): number | null {
  if (lastMonth === 0) return null;
  return Math.round(((thisMonth - lastMonth) / lastMonth) * 1000) / 10;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Mean of a rating's answer scores. 0 when the rating has no answers. */
function ratingMean(r: AnswersRow): number {
  if (r.answers.length === 0) return 0;
  let sum = 0;
  for (const a of r.answers) sum += a.score;
  return sum / r.answers.length;
}

export function totalFeedbackMoM(
  ratings: ReadonlyArray<TimedRow>,
  now: Date = new Date(),
): MonthOverMonth {
  const thisStart = startOfMonth(now);
  const lastStart = startOfPrevMonth(now);
  let thisMonth = 0;
  let lastMonth = 0;
  for (const r of ratings) {
    const t = r.createdAt.getTime();
    if (t >= thisStart.getTime()) thisMonth++;
    else if (t >= lastStart.getTime()) lastMonth++;
  }
  return { thisMonth, lastMonth, deltaPct: deltaPct(thisMonth, lastMonth) };
}

export function avgScoreMoM(
  ratings: ReadonlyArray<AnswersRow>,
  now: Date = new Date(),
): MonthOverMonth {
  const thisStart = startOfMonth(now);
  const lastStart = startOfPrevMonth(now);
  let thisSum = 0;
  let thisN = 0;
  let lastSum = 0;
  let lastN = 0;
  for (const r of ratings) {
    if (r.answers.length === 0) continue;
    const t = r.createdAt.getTime();
    const score = ratingMean(r);
    if (t >= thisStart.getTime()) {
      thisSum += score;
      thisN++;
    } else if (t >= lastStart.getTime()) {
      lastSum += score;
      lastN++;
    }
  }
  const thisMonth = thisN === 0 ? 0 : round1(thisSum / thisN);
  const lastMonth = lastN === 0 ? 0 : round1(lastSum / lastN);
  return { thisMonth, lastMonth, deltaPct: deltaPct(thisMonth, lastMonth) };
}

export interface PerQuestionTeamAvg {
  key: string;
  labelEn: string;
  avg: number;
}

/**
 * Per-question avg over the trailing 30 days, across the team. Returns
 * an array sorted by (first-seen ord). Empty array when no in-window
 * answers exist.
 */
export function teamPerQuestionAverages(
  ratings: ReadonlyArray<AnswersRow>,
  now: Date = new Date(),
): PerQuestionTeamAvg[] {
  const cutoff = now.getTime() - 30 * DAY_MS;
  const perKey = new Map<string, { labelEn: string; ord: number; sum: number; n: number }>();
  for (const r of ratings) {
    if (r.createdAt.getTime() < cutoff) continue;
    for (const a of r.answers) {
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
  }
  return Array.from(perKey.entries())
    .map(([key, slot]) => ({ key, labelEn: slot.labelEn, avg: round1(slot.sum / slot.n) }))
    .sort((a, b) => {
      // Same secondary sort as aggregateRatings — preserve question ord.
      const aOrd = perKey.get(a.key)!.ord;
      const bOrd = perKey.get(b.key)!.ord;
      return aOrd - bOrd;
    });
}

export interface ResolutionRate {
  atRiskPairs: number;
  resolvedPairs: number;
  /** resolvedPairs / atRiskPairs in [0,1]; null when atRiskPairs=0. */
  rate: number | null;
}

/**
 * Of all (rep, rater) pairs that ever produced a rating with ANY answer
 * score ≤ 3, what fraction had a follow-up rating from the SAME rater
 * within `withinDays` (default 60) where ALL answer scores > 3?
 */
export function resolutionRate(
  ratings: ReadonlyArray<AnswersPairRow>,
  withinDays: number = 60,
): ResolutionRate {
  const windowMs = withinDays * DAY_MS;

  // Group rows per (rep, rater) pair, sorted by createdAt asc.
  const pairs = new Map<string, AnswersPairRow[]>();
  for (const r of ratings) {
    const key = `${r.repUserId}::${r.raterUserId}`;
    const arr = pairs.get(key);
    if (arr) arr.push(r);
    else pairs.set(key, [r]);
  }

  let atRisk = 0;
  let resolved = 0;
  for (const arr of pairs.values()) {
    arr.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    let firstAtRiskAt: number | null = null;
    for (const r of arr) {
      if (r.answers.length === 0) continue;
      let min = Infinity;
      for (const a of r.answers) if (a.score < min) min = a.score;
      if (firstAtRiskAt === null) {
        if (min <= 3) firstAtRiskAt = r.createdAt.getTime();
      } else {
        const gap = r.createdAt.getTime() - firstAtRiskAt;
        if (gap > 0 && gap <= windowMs && min > 3) {
          resolved++;
          break;
        }
      }
    }
    if (firstAtRiskAt !== null) atRisk++;
  }

  return {
    atRiskPairs: atRisk,
    resolvedPairs: resolved,
    rate: atRisk === 0 ? null : Math.round((resolved / atRisk) * 100) / 100,
  };
}

export interface WeeklyTrendBucket {
  weekStart: Date;
  avgOverall: number | null;
  count: number;
}

/**
 * 12 weekly buckets ending at "now". Each bucket holds avg overall score
 * for ratings in that week (Sun-anchored UTC). Empty buckets → null avg.
 */
export function weeklyTrendSeries(
  ratings: ReadonlyArray<AnswersRow>,
  now: Date = new Date(),
): WeeklyTrendBucket[] {
  // Anchor: last full midnight, then back up to start of week (Sunday UTC).
  const today = startOfDayUTC(now);
  const dow = today.getUTCDay();
  const thisWeekStart = new Date(today.getTime() - dow * DAY_MS);

  const buckets: { start: number; end: number; sum: number; n: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const start = thisWeekStart.getTime() - i * 7 * DAY_MS;
    buckets.push({ start, end: start + 7 * DAY_MS, sum: 0, n: 0 });
  }

  for (const r of ratings) {
    if (r.answers.length === 0) continue;
    const t = r.createdAt.getTime();
    if (t < buckets[0].start || t >= buckets[buckets.length - 1].end) continue;
    const idx = Math.floor((t - buckets[0].start) / (7 * DAY_MS));
    if (idx < 0 || idx >= buckets.length) continue;
    buckets[idx].sum += ratingMean(r);
    buckets[idx].n++;
  }

  return buckets.map((b) => ({
    weekStart: new Date(b.start),
    avgOverall: b.n === 0 ? null : round1(b.sum / b.n),
    count: b.n,
  }));
}

/**
 * Per-rep, count of distinct UTC days in the last 30d that had at least
 * one rating. Returns Record keyed by repUserId.
 */
export function repInteractionFrequency(
  ratings: ReadonlyArray<RepRow>,
  now: Date = new Date(),
): Record<string, number> {
  const cutoff = now.getTime() - 30 * DAY_MS;
  const seen = new Map<string, Set<string>>();
  for (const r of ratings) {
    const t = r.createdAt.getTime();
    if (t < cutoff) continue;
    const day = startOfDayUTC(r.createdAt).toISOString();
    const set = seen.get(r.repUserId);
    if (set) set.add(day);
    else seen.set(r.repUserId, new Set([day]));
  }
  const out: Record<string, number> = {};
  for (const [repId, days] of seen.entries()) out[repId] = days.size;
  return out;
}
