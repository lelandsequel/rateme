import { describe, it, expect } from "vitest";
import {
  totalFeedbackMoM,
  avgScoreMoM,
  teamPerQuestionAverages,
  resolutionRate,
  weeklyTrendSeries,
  repInteractionFrequency,
} from "./manager-stats";

const NOW = new Date("2026-04-29T12:00:00Z");

interface AnswersRow {
  answers: Array<{ score: number; question: { key: string; labelEn: string; ord: number } }>;
  createdAt: Date;
}

// 5-question rating, every answer = `score`. Drop in different scoresByKey to
// vary per-question.
function row(
  createdAt: Date,
  opts: { score?: number; scoresByKey?: Partial<Record<string, number>> } = {},
): AnswersRow {
  const base = opts.score ?? 5;
  const order = ["a", "b", "c", "d", "e"];
  return {
    createdAt,
    answers: order.map((k, i) => ({
      score: opts.scoresByKey?.[k] ?? base,
      question: { key: k, labelEn: `Q${k.toUpperCase()}`, ord: i },
    })),
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

  it("averages per-rating means per month", () => {
    const out = avgScoreMoM(
      [
        row(new Date("2026-04-15T00:00:00Z"), { score: 4 }),
        row(new Date("2026-04-20T00:00:00Z"), { score: 5 }),
        row(new Date("2026-03-10T00:00:00Z"), { score: 3 }),
      ],
      NOW,
    );
    expect(out.thisMonth).toBe(4.5);
    expect(out.lastMonth).toBe(3);
    expect(out.deltaPct).toBe(50);
  });

  it("returns null delta when last month had nothing", () => {
    const out = avgScoreMoM([row(new Date("2026-04-15T00:00:00Z"), { score: 4 })], NOW);
    expect(out.deltaPct).toBeNull();
  });
});

describe("teamPerQuestionAverages", () => {
  it("returns empty when no ratings in last 30 days", () => {
    expect(teamPerQuestionAverages([], NOW)).toEqual([]);
    expect(
      teamPerQuestionAverages([row(new Date("2026-01-01T00:00:00Z"), { score: 5 })], NOW),
    ).toEqual([]);
  });

  it("computes the mean per question within last 30d, sorted by ord", () => {
    const r1 = row(new Date("2026-04-15T00:00:00Z"), {
      scoresByKey: { a: 5, b: 4, c: 3, d: 2, e: 1 },
    });
    const r2 = row(new Date("2026-04-20T00:00:00Z"), {
      scoresByKey: { a: 3, b: 4, c: 5, d: 4, e: 3 },
    });
    const out = teamPerQuestionAverages([r1, r2], NOW);
    const byKey = Object.fromEntries(out.map((q) => [q.key, q.avg]));
    expect(byKey.a).toBe(4); // (5+3)/2
    expect(byKey.b).toBe(4);
    expect(byKey.c).toBe(4);
    expect(byKey.d).toBe(3);
    expect(byKey.e).toBe(2);
    expect(out.map((q) => q.key)).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("resolutionRate", () => {
  function pair(
    repUserId: string,
    raterUserId: string,
    createdAt: Date,
    score: number,
    scoresByKey: Partial<Record<string, number>> = {},
  ) {
    const base = row(createdAt, { score, scoresByKey });
    return { ...base, repUserId, raterUserId };
  }

  it("returns null rate when no pairs were ever at risk", () => {
    const out = resolutionRate([
      pair("rep-1", "rater-1", new Date("2026-04-01T00:00:00Z"), 5),
    ]);
    expect(out.atRiskPairs).toBe(0);
    expect(out.resolvedPairs).toBe(0);
    expect(out.rate).toBeNull();
  });

  it("counts a follow-up with all answers > 3 as resolved within window", () => {
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

  it("does not count a follow-up where any answer is still <= 3", () => {
    const out = resolutionRate([
      pair("rep-1", "rater-1", new Date("2026-03-01T00:00:00Z"), 2),
      pair("rep-1", "rater-1", new Date("2026-03-05T00:00:00Z"), 5, { c: 3 }),
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
    const series = weeklyTrendSeries([row(NOW, { score: 4 })], NOW);
    const last = series[series.length - 1];
    expect(last.count).toBe(1);
    expect(last.avgOverall).toBe(4);
  });

  it("ignores ratings outside the 12-week window", () => {
    const old = new Date("2025-01-01T00:00:00Z");
    const series = weeklyTrendSeries([row(old, { score: 4 })], NOW);
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
