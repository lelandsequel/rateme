import { describe, it, expect } from "vitest";
import {
  totalFeedbackMoM,
  avgScoreMoM,
  teamDimensionAverages,
  resolutionRate,
  weeklyTrendSeries,
  repInteractionFrequency,
} from "./manager-stats";

const NOW = new Date("2026-04-29T12:00:00Z");

interface DimRow {
  responsiveness: number;
  productKnowledge: number;
  followThrough: number;
  listeningNeedsFit: number;
  trustIntegrity: number;
  createdAt: Date;
}

function dimRow(createdAt: Date, dim: number = 5): DimRow {
  return {
    createdAt,
    responsiveness: dim,
    productKnowledge: dim,
    followThrough: dim,
    listeningNeedsFit: dim,
    trustIntegrity: dim,
  };
}

describe("totalFeedbackMoM", () => {
  it("returns zeroes and null delta on an empty list", () => {
    const out = totalFeedbackMoM([], NOW);
    expect(out).toEqual({ thisMonth: 0, lastMonth: 0, deltaPct: null });
  });

  it("counts only this-month ratings", () => {
    const out = totalFeedbackMoM(
      [
        { createdAt: new Date("2026-04-02T00:00:00Z") },
        { createdAt: new Date("2026-04-15T00:00:00Z") },
      ],
      NOW,
    );
    expect(out.thisMonth).toBe(2);
    expect(out.lastMonth).toBe(0);
    expect(out.deltaPct).toBeNull();
  });

  it("counts only last-month ratings", () => {
    const out = totalFeedbackMoM(
      [
        { createdAt: new Date("2026-03-02T00:00:00Z") },
        { createdAt: new Date("2026-03-30T00:00:00Z") },
      ],
      NOW,
    );
    expect(out.thisMonth).toBe(0);
    expect(out.lastMonth).toBe(2);
    expect(out.deltaPct).toBe(-100);
  });

  it("computes delta% on mixed data", () => {
    const out = totalFeedbackMoM(
      [
        { createdAt: new Date("2026-04-02T00:00:00Z") },
        { createdAt: new Date("2026-04-15T00:00:00Z") },
        { createdAt: new Date("2026-04-20T00:00:00Z") },
        { createdAt: new Date("2026-03-15T00:00:00Z") },
        { createdAt: new Date("2026-03-30T00:00:00Z") },
        { createdAt: new Date("2026-02-01T00:00:00Z") }, // pre-window
      ],
      NOW,
    );
    expect(out.thisMonth).toBe(3);
    expect(out.lastMonth).toBe(2);
    expect(out.deltaPct).toBe(50);
  });
});

describe("avgScoreMoM", () => {
  it("returns zero when there are no ratings", () => {
    expect(avgScoreMoM([], NOW)).toEqual({ thisMonth: 0, lastMonth: 0, deltaPct: null });
  });

  it("averages dimension means per month", () => {
    const out = avgScoreMoM(
      [
        dimRow(new Date("2026-04-15T00:00:00Z"), 4),
        dimRow(new Date("2026-04-20T00:00:00Z"), 5),
        dimRow(new Date("2026-03-10T00:00:00Z"), 3),
      ],
      NOW,
    );
    expect(out.thisMonth).toBe(4.5);
    expect(out.lastMonth).toBe(3);
    expect(out.deltaPct).toBe(50);
  });

  it("returns null delta when last month had nothing", () => {
    const out = avgScoreMoM([dimRow(new Date("2026-04-15T00:00:00Z"), 4)], NOW);
    expect(out.deltaPct).toBeNull();
  });
});

describe("teamDimensionAverages", () => {
  it("returns null when no ratings in last 30 days", () => {
    expect(teamDimensionAverages([], NOW)).toBeNull();
    expect(
      teamDimensionAverages([dimRow(new Date("2026-01-01T00:00:00Z"), 5)], NOW),
    ).toBeNull();
  });

  it("computes the mean per dimension within last 30d", () => {
    const r1: DimRow = {
      createdAt: new Date("2026-04-15T00:00:00Z"),
      responsiveness: 5,
      productKnowledge: 4,
      followThrough: 3,
      listeningNeedsFit: 2,
      trustIntegrity: 1,
    };
    const r2: DimRow = {
      createdAt: new Date("2026-04-20T00:00:00Z"),
      responsiveness: 3,
      productKnowledge: 4,
      followThrough: 5,
      listeningNeedsFit: 4,
      trustIntegrity: 3,
    };
    const out = teamDimensionAverages([r1, r2], NOW)!;
    expect(out.responsiveness).toBe(4);
    expect(out.productKnowledge).toBe(4);
    expect(out.followThrough).toBe(4);
    expect(out.listeningNeedsFit).toBe(3);
    expect(out.trustIntegrity).toBe(2);
  });
});

describe("resolutionRate", () => {
  function pair(
    repUserId: string,
    raterUserId: string,
    createdAt: Date,
    dim: number,
  ) {
    return {
      repUserId,
      raterUserId,
      createdAt,
      responsiveness: dim,
      productKnowledge: dim,
      followThrough: dim,
      listeningNeedsFit: dim,
      trustIntegrity: dim,
    };
  }

  it("returns null rate when no pairs were ever at risk", () => {
    const out = resolutionRate([
      pair("rep-1", "rater-1", new Date("2026-04-01T00:00:00Z"), 5),
    ]);
    expect(out.atRiskPairs).toBe(0);
    expect(out.resolvedPairs).toBe(0);
    expect(out.rate).toBeNull();
  });

  it("counts a follow-up with all dims > 3 as resolved within window", () => {
    const out = resolutionRate([
      pair("rep-1", "rater-1", new Date("2026-03-01T00:00:00Z"), 2),
      pair("rep-1", "rater-1", new Date("2026-03-15T00:00:00Z"), 5),
    ]);
    expect(out.atRiskPairs).toBe(1);
    expect(out.resolvedPairs).toBe(1);
    expect(out.rate).toBe(1);
  });

  it("does not count a follow-up after the window closes", () => {
    const out = resolutionRate(
      [
        pair("rep-1", "rater-1", new Date("2026-01-01T00:00:00Z"), 2),
        pair("rep-1", "rater-1", new Date("2026-03-15T00:00:00Z"), 5), // 73d
      ],
      60,
    );
    expect(out.atRiskPairs).toBe(1);
    expect(out.resolvedPairs).toBe(0);
    expect(out.rate).toBe(0);
  });

  it("does not count a follow-up where any dim is still <= 3", () => {
    const out = resolutionRate([
      pair("rep-1", "rater-1", new Date("2026-03-01T00:00:00Z"), 2),
      {
        ...pair("rep-1", "rater-1", new Date("2026-03-05T00:00:00Z"), 5),
        followThrough: 3,
      },
    ]);
    expect(out.atRiskPairs).toBe(1);
    expect(out.resolvedPairs).toBe(0);
  });

  it("computes mixed resolved/atRisk math", () => {
    const out = resolutionRate([
      // pair A: at risk + resolved
      pair("rep-1", "rater-1", new Date("2026-03-01T00:00:00Z"), 2),
      pair("rep-1", "rater-1", new Date("2026-03-10T00:00:00Z"), 5),
      // pair B: at risk, no resolution
      pair("rep-1", "rater-2", new Date("2026-03-01T00:00:00Z"), 1),
      // pair C: never at risk
      pair("rep-2", "rater-3", new Date("2026-03-01T00:00:00Z"), 5),
      // pair D: at risk + resolved
      pair("rep-2", "rater-4", new Date("2026-03-01T00:00:00Z"), 3),
      pair("rep-2", "rater-4", new Date("2026-03-20T00:00:00Z"), 4),
    ]);
    expect(out.atRiskPairs).toBe(3);
    expect(out.resolvedPairs).toBe(2);
    expect(out.rate).toBe(0.67);
  });
});

describe("weeklyTrendSeries", () => {
  it("always returns 12 buckets", () => {
    expect(weeklyTrendSeries([], NOW).length).toBe(12);
  });

  it("empty buckets get null avg and zero count", () => {
    const series = weeklyTrendSeries([], NOW);
    for (const b of series) {
      expect(b.avgOverall).toBeNull();
      expect(b.count).toBe(0);
    }
  });

  it("places ratings into the right bucket", () => {
    const series = weeklyTrendSeries([dimRow(NOW, 4)], NOW);
    const last = series[series.length - 1];
    expect(last.count).toBe(1);
    expect(last.avgOverall).toBe(4);
  });

  it("ignores ratings outside the 12-week window", () => {
    const old = new Date("2025-01-01T00:00:00Z");
    const series = weeklyTrendSeries([dimRow(old, 4)], NOW);
    expect(series.every((b) => b.count === 0)).toBe(true);
  });
});

describe("repInteractionFrequency", () => {
  it("returns empty record for no ratings", () => {
    expect(repInteractionFrequency([], NOW)).toEqual({});
  });

  it("counts distinct UTC days, not raw rating count", () => {
    const out = repInteractionFrequency(
      [
        { repUserId: "rep-1", createdAt: new Date("2026-04-15T08:00:00Z") },
        { repUserId: "rep-1", createdAt: new Date("2026-04-15T22:00:00Z") }, // same day
        { repUserId: "rep-1", createdAt: new Date("2026-04-16T01:00:00Z") },
        { repUserId: "rep-2", createdAt: new Date("2026-04-15T01:00:00Z") },
      ],
      NOW,
    );
    expect(out["rep-1"]).toBe(2);
    expect(out["rep-2"]).toBe(1);
  });

  it("ignores ratings older than 30 days", () => {
    const out = repInteractionFrequency(
      [
        { repUserId: "rep-1", createdAt: new Date("2026-01-01T00:00:00Z") },
        { repUserId: "rep-1", createdAt: new Date("2026-04-20T00:00:00Z") },
      ],
      NOW,
    );
    expect(out["rep-1"]).toBe(1);
  });
});
