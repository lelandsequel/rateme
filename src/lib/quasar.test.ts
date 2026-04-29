import { describe, it, expect } from "vitest";
import {
  scoreRep,
  aggregateRepSignals,
  type RepActivitySignals,
} from "./quasar";

// Helper for shaping signal objects with sane defaults.
function signals(overrides: Partial<RepActivitySignals> = {}): RepActivitySignals {
  return {
    recentSessionCount: 0,
    recentSessionAvgSentiment: NaN,
    pipelineDealsAdvanced: 0,
    pipelineDealsTotal: 0,
    pipelineDealsWon: 0,
    pipelineDealsLost: 0,
    daysSinceLastActivity: 9999,
    tenureDays: 0,
    signalsAvailable: 0,
    signalsTotal: 6,
    ...overrides,
  };
}

describe("scoreRep — empty signals", () => {
  it("scores low, low confidence, at-risk band", () => {
    const r = scoreRep(signals());
    expect(r.score).toBeLessThan(30);
    expect(r.confidence).toBeLessThan(0.3);
    expect(r.band).toBe("at-risk");
    expect(r.reasons.length).toBeGreaterThanOrEqual(2);
    expect(r.reasons.length).toBeLessThanOrEqual(4);
  });
});

describe("scoreRep — high activity + high win rate + recent", () => {
  it("scores >= 90, band thriving", () => {
    const r = scoreRep(
      signals({
        recentSessionCount: 18,
        recentSessionAvgSentiment: 0.9,
        pipelineDealsAdvanced: 8,
        pipelineDealsTotal: 10,
        pipelineDealsWon: 7,
        pipelineDealsLost: 1,
        daysSinceLastActivity: 0,
        tenureDays: 800,
        signalsAvailable: 6,
        signalsTotal: 6,
      }),
    );
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.band).toBe("thriving");
    expect(r.confidence).toBeGreaterThan(0.9);
  });
});

describe("scoreRep — high activity but stale", () => {
  it("recency penalty drops the band", () => {
    const fresh = scoreRep(
      signals({
        recentSessionCount: 18,
        recentSessionAvgSentiment: 0.9,
        pipelineDealsAdvanced: 8,
        pipelineDealsTotal: 10,
        pipelineDealsWon: 7,
        pipelineDealsLost: 1,
        daysSinceLastActivity: 0,
        tenureDays: 500,
        signalsAvailable: 6,
        signalsTotal: 6,
      }),
    );
    const stale = scoreRep(
      signals({
        recentSessionCount: 18,
        recentSessionAvgSentiment: 0.9,
        pipelineDealsAdvanced: 8,
        pipelineDealsTotal: 10,
        pipelineDealsWon: 7,
        pipelineDealsLost: 1,
        daysSinceLastActivity: 25,
        tenureDays: 500,
        signalsAvailable: 6,
        signalsTotal: 6,
      }),
    );
    expect(stale.score).toBeLessThan(fresh.score);
    expect(stale.breakdown.recencyMultiplier).toBeLessThan(1);
    // stale should have dropped at least one band relative to fresh
    const ranks: Record<string, number> = { thriving: 4, steady: 3, watch: 2, "at-risk": 1 };
    expect(ranks[stale.band]).toBeLessThan(ranks[fresh.band]);
    // and the recency reason should appear
    expect(stale.reasons.some((r) => r.toLowerCase().includes("no activity in"))).toBe(true);
  });
});

describe("scoreRep — sparse signals", () => {
  it("low confidence even when only sessionCount is moderate", () => {
    const r = scoreRep(
      signals({
        recentSessionCount: 6,
        recentSessionAvgSentiment: NaN,
        pipelineDealsAdvanced: 0,
        pipelineDealsTotal: 0,
        pipelineDealsWon: 0,
        pipelineDealsLost: 0,
        daysSinceLastActivity: 1,
        tenureDays: 100,
        signalsAvailable: 3, // only sessions+recency+tenure available
        signalsTotal: 6,
      }),
    );
    expect(r.confidence).toBeLessThanOrEqual(0.5);
  });
});

describe("scoreRep — tenure adjustment", () => {
  it("new rep gets ramp grace bonus over veteran with same signals", () => {
    const base = {
      recentSessionCount: 6,
      recentSessionAvgSentiment: 0.6,
      pipelineDealsAdvanced: 3,
      pipelineDealsTotal: 6,
      pipelineDealsWon: 2,
      pipelineDealsLost: 2,
      daysSinceLastActivity: 1,
      signalsAvailable: 6,
      signalsTotal: 6,
    };
    const newRep = scoreRep(signals({ ...base, tenureDays: 30 }));
    const veteran = scoreRep(signals({ ...base, tenureDays: 1000 }));
    expect(newRep.score).toBeGreaterThan(veteran.score);
    expect(newRep.breakdown.tenureAdjustment).toBeGreaterThan(
      veteran.breakdown.tenureAdjustment,
    );
  });
});

describe("scoreRep — band thresholds", () => {
  it("derives correct bands at boundaries", () => {
    // 92 -> thriving
    expect(
      scoreRep(
        signals({
          recentSessionCount: 30,
          recentSessionAvgSentiment: 1,
          pipelineDealsAdvanced: 10,
          pipelineDealsTotal: 10,
          pipelineDealsWon: 10,
          pipelineDealsLost: 0,
          daysSinceLastActivity: 0,
          tenureDays: 800,
          signalsAvailable: 6,
          signalsTotal: 6,
        }),
      ).band,
    ).toBe("thriving");
  });
});

describe("scoreRep — weight redistribution", () => {
  it("missing sentiment + missing pipeline don't crash; activity weight scales up", () => {
    // Only activity contribution available -> activity drives score entirely
    const onlyActivity = scoreRep(
      signals({
        recentSessionCount: 20, // tanh(2) ≈ 0.964
        daysSinceLastActivity: 0,
        tenureDays: 500,
        signalsAvailable: 3,
        signalsTotal: 6,
      }),
    );
    // tanh(2) ≈ 0.964 → score ~= 96 with no recency penalty and no tenure adj.
    expect(onlyActivity.score).toBeGreaterThanOrEqual(90);
    expect(onlyActivity.breakdown.sentimentContribution).toBeNull();
    expect(onlyActivity.breakdown.pipelineProgressContribution).toBeNull();
    expect(onlyActivity.breakdown.pipelineWinRateContribution).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// aggregateRepSignals
// ---------------------------------------------------------------------------

describe("aggregateRepSignals", () => {
  const NOW = new Date("2026-04-27T12:00:00Z");
  const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

  it("counts sessions in last 7 days, ignores older", () => {
    const out = aggregateRepSignals(
      { hireDate: new Date("2024-01-01") },
      [
        { startedAt: day(1), sentiment: 0.8 },
        { startedAt: day(6), sentiment: 0.6 },
        { startedAt: day(10), sentiment: 0.9 }, // outside 7-day window
      ],
      [],
      NOW,
    );
    expect(out.recentSessionCount).toBe(2);
    expect(out.recentSessionAvgSentiment).toBeCloseTo(0.7, 5);
  });

  it("counts deal activities in last 30 days", () => {
    const out = aggregateRepSignals(
      { hireDate: new Date("2024-01-01") },
      [],
      [
        { occurredAt: day(2), type: "advanced" },
        { occurredAt: day(5), type: "won" },
        { occurredAt: day(8), type: "lost" },
        { occurredAt: day(15), type: "advanced" },
        { occurredAt: day(40), type: "won" }, // outside 30-day window
      ],
      NOW,
    );
    expect(out.pipelineDealsAdvanced).toBe(2);
    expect(out.pipelineDealsWon).toBe(1);
    expect(out.pipelineDealsLost).toBe(1);
    expect(out.pipelineDealsTotal).toBe(4);
  });

  it("computes daysSinceLastActivity from latest of sessions or deals", () => {
    const out = aggregateRepSignals(
      { hireDate: new Date("2024-01-01") },
      [{ startedAt: day(5), sentiment: 0.5 }],
      [{ occurredAt: day(2), type: "advanced" }],
      NOW,
    );
    expect(out.daysSinceLastActivity).toBe(2);
  });

  it("returns NaN sentiment when no sessions had sentiment", () => {
    const out = aggregateRepSignals(
      { hireDate: new Date("2024-01-01") },
      [{ startedAt: day(1), sentiment: null }],
      [],
      NOW,
    );
    expect(Number.isNaN(out.recentSessionAvgSentiment)).toBe(true);
  });

  it("returns 9999 daysSinceLastActivity when no activity", () => {
    const out = aggregateRepSignals(
      { hireDate: new Date("2024-01-01") },
      [],
      [],
      NOW,
    );
    expect(out.daysSinceLastActivity).toBe(9999);
  });

  it("computes tenure in days correctly", () => {
    const out = aggregateRepSignals(
      { hireDate: new Date(NOW.getTime() - 100 * 86_400_000) },
      [],
      [],
      NOW,
    );
    expect(out.tenureDays).toBe(100);
  });

  it("counts signals available accurately", () => {
    const full = aggregateRepSignals(
      { hireDate: new Date("2024-01-01") },
      [{ startedAt: day(1), sentiment: 0.7 }],
      [
        { occurredAt: day(2), type: "won" },
        { occurredAt: day(3), type: "advanced" },
      ],
      NOW,
    );
    expect(full.signalsAvailable).toBe(6);
    expect(full.signalsTotal).toBe(6);
  });
});
