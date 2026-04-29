/**
 * QUASAR scoring engine — pure functional rep performance scorer.
 *
 * Adapted from the COSMIC QUASAR pattern (originally for KB content
 * importance) to model rep performance from activity, sentiment, pipeline,
 * recency, and tenure signals.
 *
 * Design principles:
 *   - 100% pure: no DB, no IO, no globals. Every input is passed in.
 *   - Component contributions normalize to 0..1 and combine with weights
 *     that proportionally redistribute when a component is unavailable.
 *   - Recency multiplies the aggregate; tenure adjusts at the end.
 *   - Confidence reflects both data coverage AND data volume.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RepActivitySignals {
  /** 7-day window: count of sessions (calls + demos + meetings) logged. */
  recentSessionCount: number;
  /**
   * 7-day window: mean sentiment across recent sessions, in [0, 1].
   * NaN means no sessions had sentiment data — component is treated as
   * unavailable and its weight is redistributed.
   */
  recentSessionAvgSentiment: number;
  /** 30-day window: count of deals advanced to a later stage. */
  pipelineDealsAdvanced: number;
  /** 30-day window: total deals touched. */
  pipelineDealsTotal: number;
  /** 30-day window: closed-won count. */
  pipelineDealsWon: number;
  /** 30-day window: closed-lost count. */
  pipelineDealsLost: number;
  /** Days since last activity of any kind. 0 = today, 30+ = stale. */
  daysSinceLastActivity: number;
  /** Days since hire. Used for ramp grace and seniority adjustments. */
  tenureDays: number;
  /**
   * How many of the expected signal sources actually had data when these
   * signals were aggregated. Drives confidence.
   */
  signalsAvailable: number;
  /** Maximum possible signals (denominator for confidence). */
  signalsTotal: number;
}

export type RepBand = "thriving" | "steady" | "watch" | "at-risk";

export interface QuasarBreakdown {
  /** Activity volume contribution, 0..1. Always present. */
  activityVolumeContribution: number;
  /** Sentiment contribution, 0..1, or null if unavailable. */
  sentimentContribution: number | null;
  /** Pipeline progress contribution, 0..1, or null if no deals touched. */
  pipelineProgressContribution: number | null;
  /** Pipeline win-rate contribution, 0..1, or null if no closed deals. */
  pipelineWinRateContribution: number | null;
  /** Recency multiplier applied to the weighted aggregate, 0.4..1.0. */
  recencyMultiplier: number;
  /** Tenure adjustment in score points (post-multiplication), -0.05..+0.05. */
  tenureAdjustment: number;
}

export interface QuasarResult {
  /** Final score, integer, clamped to [0, 100]. */
  score: number;
  /** Confidence in the score, 0..1, two-decimal precision. */
  confidence: number;
  /** Discrete band derived from score. */
  band: RepBand;
  /** Per-component breakdown so callers can explain the number. */
  breakdown: QuasarBreakdown;
  /** 2-4 short human-readable reasons for the score. */
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Component weights — must sum to 1.0 when all components are available. */
const WEIGHTS = {
  activity: 0.30,
  sentiment: 0.20,
  pipelineProgress: 0.30,
  pipelineWinRate: 0.20,
} as const;

/** Sessions/week we consider "expected baseline". `tanh(x/10)` saturates here. */
const ACTIVITY_BASELINE = 10;

/** Recency taper boundaries. */
const RECENCY_FRESH_DAYS = 3;   // <=3 days: full credit
const RECENCY_FLOOR_DAYS = 30;  // 30 days: 0.6 multiplier
const RECENCY_FLOOR = 0.4;      // beyond 30 days: 0.4 floor
const RECENCY_FRESH = 1.0;
const RECENCY_30D = 0.6;

/** Band thresholds. */
const BAND_THRIVING = 90;
const BAND_STEADY = 75;
const BAND_WATCH = 60;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  if (Number.isNaN(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

function isUsable(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * Recency multiplier:
 *   days <= 3        => 1.0
 *   3 < days < 30    => linear taper from 1.0 to 0.6
 *   days >= 30       => 0.4 floor
 */
function computeRecencyMultiplier(daysSinceLastActivity: number): number {
  const d = Math.max(0, daysSinceLastActivity);
  if (d <= RECENCY_FRESH_DAYS) return RECENCY_FRESH;
  if (d >= RECENCY_FLOOR_DAYS + 1) return RECENCY_FLOOR;
  if (d <= RECENCY_FLOOR_DAYS) {
    // linear from (3, 1.0) to (30, 0.6)
    const span = RECENCY_FLOOR_DAYS - RECENCY_FRESH_DAYS;
    const drop = RECENCY_FRESH - RECENCY_30D;
    return RECENCY_FRESH - drop * ((d - RECENCY_FRESH_DAYS) / span);
  }
  return RECENCY_FLOOR;
}

/**
 * Tenure adjustment: small bonuses for new (ramp grace) or veteran reps.
 *  - tenure < 90 days: +0.05 (ramp grace)
 *  - tenure > 365 days: +0.02 (calibrated experience)
 *  - else 0
 */
function computeTenureAdjustment(tenureDays: number): number {
  if (tenureDays < 0) return 0;
  if (tenureDays < 90) return 0.05;
  if (tenureDays > 365) return 0.02;
  return 0;
}

function deriveBand(score: number): RepBand {
  if (score >= BAND_THRIVING) return "thriving";
  if (score >= BAND_STEADY) return "steady";
  if (score >= BAND_WATCH) return "watch";
  return "at-risk";
}

// ---------------------------------------------------------------------------
// Main scorer
// ---------------------------------------------------------------------------

export function scoreRep(signals: RepActivitySignals): QuasarResult {
  // ---- Activity volume (0..1) -----------------------------------------
  // tanh saturates: 0 sessions => 0; baseline (10) => ~0.76; 20 => ~0.96.
  const activityVolume = clamp(
    Math.tanh(Math.max(0, signals.recentSessionCount) / ACTIVITY_BASELINE),
    0,
    1,
  );

  // ---- Sentiment (0..1 or null) ---------------------------------------
  const sentiment =
    isUsable(signals.recentSessionAvgSentiment)
      ? clamp(signals.recentSessionAvgSentiment, 0, 1)
      : null;

  // ---- Pipeline progress (0..1 or null) -------------------------------
  // advanced / total. If no deals touched, this signal is null.
  const pipelineProgress =
    signals.pipelineDealsTotal > 0
      ? clamp(signals.pipelineDealsAdvanced / signals.pipelineDealsTotal, 0, 1)
      : null;

  // ---- Pipeline win-rate (0..1 or null) -------------------------------
  // won / (won + lost). If no closed deals, null.
  const closedDeals = signals.pipelineDealsWon + signals.pipelineDealsLost;
  const pipelineWinRate =
    closedDeals > 0
      ? clamp(signals.pipelineDealsWon / closedDeals, 0, 1)
      : null;

  // ---- Weighted aggregate with proportional redistribution ------------
  const components: Array<{ value: number; weight: number; key: string }> = [];
  components.push({
    value: activityVolume,
    weight: WEIGHTS.activity,
    key: "activity",
  });
  if (sentiment !== null) {
    components.push({
      value: sentiment,
      weight: WEIGHTS.sentiment,
      key: "sentiment",
    });
  }
  if (pipelineProgress !== null) {
    components.push({
      value: pipelineProgress,
      weight: WEIGHTS.pipelineProgress,
      key: "pipelineProgress",
    });
  }
  if (pipelineWinRate !== null) {
    components.push({
      value: pipelineWinRate,
      weight: WEIGHTS.pipelineWinRate,
      key: "pipelineWinRate",
    });
  }

  const totalWeight = components.reduce((acc, c) => acc + c.weight, 0);
  const weightedAggregate =
    totalWeight > 0
      ? components.reduce((acc, c) => acc + c.value * (c.weight / totalWeight), 0)
      : 0;

  // ---- Recency + tenure -----------------------------------------------
  const recencyMultiplier = computeRecencyMultiplier(signals.daysSinceLastActivity);
  const tenureAdjustment = computeTenureAdjustment(signals.tenureDays);

  // ---- Final score ----------------------------------------------------
  const aggregate = weightedAggregate * recencyMultiplier + tenureAdjustment;
  const score = clamp(Math.round(aggregate * 100), 0, 100);

  // ---- Confidence -----------------------------------------------------
  // Coverage component: signalsAvailable / signalsTotal.
  const coverage =
    signals.signalsTotal > 0
      ? clamp(signals.signalsAvailable / signals.signalsTotal, 0, 1)
      : 0;
  // Volume component: sparse activity drags confidence down even if coverage is high.
  const volumeFactor = clamp(signals.recentSessionCount / 5, 0, 1);
  const rawConfidence = coverage * volumeFactor;
  const confidence = Math.round(rawConfidence * 100) / 100;

  // ---- Band -----------------------------------------------------------
  const band = deriveBand(score);

  // ---- Reasons --------------------------------------------------------
  const reasons = buildReasons({
    score,
    band,
    signals,
    sentiment,
    pipelineProgress,
    pipelineWinRate,
    activityVolume,
    recencyMultiplier,
    tenureAdjustment,
  });

  return {
    score,
    confidence,
    band,
    breakdown: {
      activityVolumeContribution: roundTo(activityVolume, 4),
      sentimentContribution: sentiment === null ? null : roundTo(sentiment, 4),
      pipelineProgressContribution:
        pipelineProgress === null ? null : roundTo(pipelineProgress, 4),
      pipelineWinRateContribution:
        pipelineWinRate === null ? null : roundTo(pipelineWinRate, 4),
      recencyMultiplier: roundTo(recencyMultiplier, 4),
      tenureAdjustment: roundTo(tenureAdjustment, 4),
    },
    reasons,
  };
}

function roundTo(v: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}

interface ReasonCtx {
  score: number;
  band: RepBand;
  signals: RepActivitySignals;
  sentiment: number | null;
  pipelineProgress: number | null;
  pipelineWinRate: number | null;
  activityVolume: number;
  recencyMultiplier: number;
  tenureAdjustment: number;
}

function buildReasons(ctx: ReasonCtx): string[] {
  const reasons: string[] = [];
  const s = ctx.signals;

  // Activity reason
  if (s.recentSessionCount >= 12) {
    reasons.push(
      `High activity volume (${s.recentSessionCount} sessions in last 7 days).`,
    );
  } else if (s.recentSessionCount >= 5) {
    reasons.push(
      `Steady activity (${s.recentSessionCount} sessions in last 7 days).`,
    );
  } else if (s.recentSessionCount > 0) {
    reasons.push(
      `Low activity volume (${s.recentSessionCount} sessions in last 7 days).`,
    );
  } else {
    reasons.push(`No sessions logged in the last 7 days.`);
  }

  // Pipeline win-rate reason
  if (ctx.pipelineWinRate !== null) {
    const pct = Math.round(ctx.pipelineWinRate * 100);
    if (ctx.pipelineWinRate >= 0.6) {
      reasons.push(`Pipeline win rate strong (${pct}%).`);
    } else if (ctx.pipelineWinRate >= 0.4) {
      reasons.push(`Pipeline win rate moderate (${pct}%).`);
    } else {
      reasons.push(`Pipeline win rate weak (${pct}%).`);
    }
  }

  // Recency reason — only call out if it actually penalized us
  if (ctx.recencyMultiplier < 1) {
    reasons.push(
      `No activity in ${s.daysSinceLastActivity} days — score conservatively penalized.`,
    );
  }

  // Sentiment reason — only if available and notably high or low
  if (ctx.sentiment !== null) {
    if (ctx.sentiment >= 0.75) {
      reasons.push(`Customer sentiment positive (${Math.round(ctx.sentiment * 100)}%).`);
    } else if (ctx.sentiment <= 0.4) {
      reasons.push(`Customer sentiment lagging (${Math.round(ctx.sentiment * 100)}%).`);
    }
  }

  // Tenure reason — only call out if it changed the score
  if (s.tenureDays < 90 && ctx.tenureAdjustment > 0) {
    reasons.push(`Ramp grace applied (rep tenure ${s.tenureDays} days).`);
  } else if (s.tenureDays > 365 && ctx.tenureAdjustment > 0) {
    reasons.push(`Veteran calibration applied (tenure ${Math.floor(s.tenureDays / 365)}y).`);
  }

  // Cap to 4 reasons; ensure at least 2 by padding with the band.
  if (reasons.length < 2) {
    reasons.push(`Score band: ${ctx.band}.`);
  }
  return reasons.slice(0, 4);
}

// ---------------------------------------------------------------------------
// aggregateRepSignals — pure projection from raw rows to scoring signals.
// ---------------------------------------------------------------------------

interface RepLike {
  hireDate?: Date | string | null;
  hiredAt?: Date | string | null;
}

interface SessionLike {
  startedAt: Date | string;
  sentiment?: number | null;
  type?: string;
}

interface DealActivityLike {
  /**
   * Activity timestamp.
   */
  occurredAt?: Date | string;
  /**
   * Activity type. Recognized values: "advanced", "won", "lost", "touched".
   * Anything else is still counted toward total.
   */
  type?: string;
}

const MS_PER_DAY = 86_400_000;

export function aggregateRepSignals(
  rep: RepLike,
  sessions: SessionLike[] = [],
  dealActivities: DealActivityLike[] = [],
  now: Date = new Date(),
): RepActivitySignals {
  const nowMs = now.getTime();

  const sevenDaysAgo = nowMs - 7 * MS_PER_DAY;
  const thirtyDaysAgo = nowMs - 30 * MS_PER_DAY;

  // ---- Sessions in last 7 days ----------------------------------------
  let recentSessionCount = 0;
  let sentimentSum = 0;
  let sentimentCount = 0;
  let lastSessionMs = -Infinity;

  for (const s of sessions) {
    const t = new Date(s.startedAt).getTime();
    if (Number.isNaN(t)) continue;
    if (t > lastSessionMs) lastSessionMs = t;
    if (t >= sevenDaysAgo) {
      recentSessionCount++;
      if (typeof s.sentiment === "number" && Number.isFinite(s.sentiment)) {
        sentimentSum += s.sentiment;
        sentimentCount++;
      }
    }
  }

  const recentSessionAvgSentiment =
    sentimentCount > 0 ? sentimentSum / sentimentCount : NaN;

  // ---- Deal activities in last 30 days --------------------------------
  let pipelineDealsAdvanced = 0;
  let pipelineDealsTotal = 0;
  let pipelineDealsWon = 0;
  let pipelineDealsLost = 0;
  let lastDealMs = -Infinity;

  for (const d of dealActivities) {
    const tRaw = d.occurredAt ? new Date(d.occurredAt).getTime() : NaN;
    if (Number.isNaN(tRaw)) continue;
    if (tRaw > lastDealMs) lastDealMs = tRaw;
    if (tRaw < thirtyDaysAgo) continue;

    pipelineDealsTotal++;
    switch ((d.type ?? "").toLowerCase()) {
      case "advanced":
        pipelineDealsAdvanced++;
        break;
      case "won":
        pipelineDealsWon++;
        break;
      case "lost":
        pipelineDealsLost++;
        break;
      default:
        // counted in total only
        break;
    }
  }

  // ---- Days since last activity (sessions OR deal activities) ---------
  const lastActivityMs = Math.max(lastSessionMs, lastDealMs);
  const daysSinceLastActivity =
    lastActivityMs === -Infinity
      ? 9999
      : Math.max(0, Math.floor((nowMs - lastActivityMs) / MS_PER_DAY));

  // ---- Tenure ---------------------------------------------------------
  const hire = rep.hireDate ?? rep.hiredAt ?? null;
  const tenureDays =
    hire == null
      ? 0
      : Math.max(0, Math.floor((nowMs - new Date(hire).getTime()) / MS_PER_DAY));

  // ---- Signals available count ----------------------------------------
  // We expect 6 signal channels:
  //   1. recentSessionCount > 0
  //   2. recentSessionAvgSentiment usable
  //   3. pipelineDealsTotal > 0
  //   4. pipelineDealsWon + pipelineDealsLost > 0
  //   5. daysSinceLastActivity is real (i.e. not 9999)
  //   6. tenureDays > 0
  const signalsTotal = 6;
  let signalsAvailable = 0;
  if (recentSessionCount > 0) signalsAvailable++;
  if (sentimentCount > 0) signalsAvailable++;
  if (pipelineDealsTotal > 0) signalsAvailable++;
  if (pipelineDealsWon + pipelineDealsLost > 0) signalsAvailable++;
  if (lastActivityMs !== -Infinity) signalsAvailable++;
  if (tenureDays > 0) signalsAvailable++;

  return {
    recentSessionCount,
    recentSessionAvgSentiment,
    pipelineDealsAdvanced,
    pipelineDealsTotal,
    pipelineDealsWon,
    pipelineDealsLost,
    daysSinceLastActivity,
    tenureDays,
    signalsAvailable,
    signalsTotal,
  };
}
