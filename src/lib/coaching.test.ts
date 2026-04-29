import { describe, it, expect } from "vitest";
import { getCoachingInsights, type CoachingSessionLike } from "./coaching";
import type { QuasarResult } from "./quasar";

function quasar(
  reasons: string[],
  band: QuasarResult["band"] = "steady",
  score = 80,
): QuasarResult {
  return {
    score,
    confidence: 0.9,
    band,
    reasons,
    breakdown: {
      activityVolumeContribution: 0.5,
      sentimentContribution: 0.5,
      pipelineProgressContribution: 0.5,
      pipelineWinRateContribution: 0.5,
      recencyMultiplier: 1.0,
      tenureAdjustment: 0,
    },
  };
}

describe("getCoachingInsights", () => {
  it("rule: pipeline win rate strong → maintain discovery cadence", () => {
    const out = getCoachingInsights(
      quasar(["Pipeline win rate strong (72%)."]),
    );
    expect(out.some((s) => s.includes("Maintain discovery cadence"))).toBe(true);
  });

  it("rule: pipeline win rate weak → improve discovery depth", () => {
    const out = getCoachingInsights(
      quasar(["Pipeline win rate weak (15%)."]),
    );
    expect(out.some((s) => s.includes("Improve discovery depth"))).toBe(true);
  });

  it("rule: low pipeline activity → improve discovery depth", () => {
    // We embed the literal phrase the rule matches on.
    const out = getCoachingInsights(
      quasar(["Low pipeline activity in the last 30 days."]),
    );
    expect(out.some((s) => s.includes("Improve discovery depth"))).toBe(true);
  });

  it("rule: no activity in N days → re-engage stale accounts", () => {
    const out = getCoachingInsights(
      quasar(["No activity in 12 days — score conservatively penalized."]),
    );
    expect(out.some((s) => s.includes("Re-engage stale accounts"))).toBe(true);
  });

  it("rule: >2 low-sentiment sessions → reduce talk-ratio", () => {
    const sessions: CoachingSessionLike[] = [
      { flags: ["low-sentiment"] },
      { flags: ["low-sentiment", "early-wake"] },
      { flags: ["low-sentiment"] },
      { flags: ["high-engagement"] },
    ];
    const out = getCoachingInsights(quasar(["Steady activity (5 sessions in last 7 days)."]), sessions);
    expect(out.some((s) => s.includes("Reduce talk-ratio"))).toBe(true);
  });

  it("rule: high activity volume + thriving → sustainable pace", () => {
    const out = getCoachingInsights(
      quasar(["High activity volume (15 sessions in last 7 days)."], "thriving", 95),
    );
    expect(out.some((s) => s.includes("Sustainable pace"))).toBe(true);
  });

  it("default fallback when nothing matches", () => {
    const out = getCoachingInsights(
      quasar(["Score band: steady."], "steady"),
      [],
    );
    expect(out).toEqual([
      "Keep doing what you're doing — score is stable and confidence is high.",
    ]);
  });

  it("caps results at 3 even when many rules match", () => {
    const sessions: CoachingSessionLike[] = [
      { flags: ["low-sentiment"] },
      { flags: ["low-sentiment"] },
      { flags: ["low-sentiment"] },
    ];
    const out = getCoachingInsights(
      quasar(
        [
          "Pipeline win rate strong (72%).",
          "High activity volume (15 sessions in last 7 days).",
          "No activity in 5 days — score conservatively penalized.",
        ],
        "thriving",
        95,
      ),
      sessions,
    );
    expect(out.length).toBeLessThanOrEqual(3);
  });
});
