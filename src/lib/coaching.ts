/**
 * Coaching insights — boilerplate v0.
 *
 * Pure-function-ish helper that turns a rep's latest QUASAR result + recent
 * session flag history into 1-3 short, actionable coaching insight strings.
 *
 * No LLM. Just a deterministic mapping over the QUASAR `reasons` field and
 * the cumulative session flags. Returned strings are stable so the mobile
 * client can hash + dedupe across polls.
 *
 * In DB-mode this is invoked by /api/reps/:id/coaching after recomputing
 * the rep score; in mock-mode it operates over the canned mock fixtures.
 */

import type { QuasarResult } from "./quasar";

/**
 * Recent-session flag context. Pass the JSON-deserialized `flags` array
 * from each of the rep's last N session rows. We only need the flags +
 * a band hint to generate insights.
 */
export interface CoachingSessionLike {
  /** Flags emitted by `scoreSession` — e.g. ["low-sentiment", "early-wake"]. */
  flags?: string[] | null;
  /** Optional per-session band; we don't use it today but mobile may. */
  band?: string | null;
}

/**
 * Produce 1..3 actionable coaching insight strings.
 *
 * Mapping rules (boilerplate v0):
 *   - "Pipeline win rate strong" → maintain discovery cadence.
 *   - "Pipeline win rate weak" / "Low pipeline activity" → improve discovery depth.
 *   - "No activity in N days"    → re-engage stale accounts.
 *   - >2 sessions with "low-sentiment" flag → reduce talk-ratio.
 *   - High activity volume + thriving band → sustainable pace, model rep.
 *   - Default fallback           → keep doing what you're doing.
 *
 * Insights are returned in priority order (most actionable first) and
 * capped at 3.
 */
export function getCoachingInsights(
  quasar: QuasarResult,
  recentSessions: CoachingSessionLike[] = [],
): string[] {
  const insights: string[] = [];
  const reasons = quasar.reasons ?? [];
  const reasonsLower = reasons.map((r) => r.toLowerCase());

  const has = (needle: string) =>
    reasonsLower.some((r) => r.includes(needle.toLowerCase()));

  // ---- Pipeline win-rate strong --------------------------------------
  if (has("pipeline win rate strong")) {
    insights.push(
      "Maintain discovery cadence — your win rate is signaling " +
        "product-market fit on your accounts.",
    );
  }

  // ---- Pipeline win-rate weak OR low pipeline activity ---------------
  if (has("pipeline win rate weak") || has("low pipeline activity")) {
    insights.push(
      "Improve discovery depth — book one second-conversation per " +
        "active deal this week.",
    );
  }

  // ---- Recency penalty (no activity in N days) -----------------------
  if (has("no activity in") || has("no sessions logged")) {
    insights.push(
      "Re-engage stale accounts — the recency penalty is the largest " +
        "factor pulling your score down.",
    );
  }

  // ---- >2 sessions flagged "low-sentiment" ---------------------------
  const lowSentimentSessionCount = recentSessions.filter((s) =>
    (s.flags ?? []).includes("low-sentiment"),
  ).length;
  if (lowSentimentSessionCount > 2) {
    insights.push(
      "Reduce talk-ratio — multiple recent sessions trended low-sentiment; " +
        "try summarizing customer pain back before each pitch transition.",
    );
  }

  // ---- High activity volume + thriving band --------------------------
  if (has("high activity volume") && quasar.band === "thriving") {
    insights.push(
      "Sustainable pace — your volume is high without sentiment drop; " +
        "this is the rep profile to model.",
    );
  }

  // ---- Default fallback ---------------------------------------------
  if (insights.length === 0) {
    insights.push(
      "Keep doing what you're doing — score is stable and confidence is high.",
    );
  }

  return insights.slice(0, 3);
}
