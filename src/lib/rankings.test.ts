import { describe, it, expect } from "vitest";
import { computeRanking } from "./rankings";

describe("computeRanking", () => {
  it("returns null on empty cohort", () => {
    expect(computeRanking("u1", [], "score")).toBeNull();
  });

  it("returns null when user is not in the cohort", () => {
    const cohort = [
      { userId: "a", metric: 5 },
      { userId: "b", metric: 4 },
    ];
    expect(computeRanking("nope", cohort, "score")).toBeNull();
  });

  it("ranks a single-entry cohort as 1/1 with 100 percentile", () => {
    const r = computeRanking("a", [{ userId: "a", metric: 3.2 }], "score");
    expect(r).toEqual({
      rank: 1,
      total: 1,
      percentile: 100,
      metric: 3.2,
      metricLabel: "score",
    });
  });

  it("gives all-tied entries rank 1 and percentile 100", () => {
    const cohort = [
      { userId: "a", metric: 4 },
      { userId: "b", metric: 4 },
      { userId: "c", metric: 4 },
    ];
    expect(computeRanking("a", cohort, "score")?.rank).toBe(1);
    expect(computeRanking("b", cohort, "score")?.rank).toBe(1);
    expect(computeRanking("c", cohort, "score")?.rank).toBe(1);
    expect(computeRanking("a", cohort, "score")?.percentile).toBe(100);
  });

  it("computes correct rank/percentile across a standard distribution", () => {
    const cohort = [
      { userId: "a", metric: 5 }, // rank 1
      { userId: "b", metric: 4 }, // rank 2
      { userId: "c", metric: 3 }, // rank 3
      { userId: "d", metric: 2 }, // rank 4
    ];
    expect(computeRanking("a", cohort, "score")).toMatchObject({
      rank: 1,
      total: 4,
      percentile: 100,
    });
    expect(computeRanking("b", cohort, "score")).toMatchObject({
      rank: 2,
      total: 4,
      percentile: 75,
    });
    expect(computeRanking("c", cohort, "score")).toMatchObject({
      rank: 3,
      total: 4,
      percentile: 50,
    });
    expect(computeRanking("d", cohort, "score")).toMatchObject({
      rank: 4,
      total: 4,
      percentile: 25,
    });
  });

  it("uses competition ranking — ties share the lower rank, next rank skips", () => {
    const cohort = [
      { userId: "a", metric: 5 }, // rank 1
      { userId: "b", metric: 4 }, // rank 2 (tie)
      { userId: "c", metric: 4 }, // rank 2 (tie)
      { userId: "d", metric: 3 }, // rank 4 (skip 3)
    ];
    expect(computeRanking("b", cohort, "score")?.rank).toBe(2);
    expect(computeRanking("c", cohort, "score")?.rank).toBe(2);
    expect(computeRanking("d", cohort, "score")?.rank).toBe(4);
  });

  it("does not mutate the input cohort", () => {
    const cohort = [
      { userId: "a", metric: 1 },
      { userId: "b", metric: 5 },
      { userId: "c", metric: 3 },
    ];
    const before = cohort.map((c) => c.userId);
    computeRanking("a", cohort, "score");
    expect(cohort.map((c) => c.userId)).toEqual(before);
  });

  it("carries through metric and metricLabel verbatim", () => {
    const r = computeRanking(
      "a",
      [
        { userId: "a", metric: 4.7 },
        { userId: "b", metric: 4.9 },
      ],
      "ratings given (year)",
    );
    expect(r?.metric).toBe(4.7);
    expect(r?.metricLabel).toBe("ratings given (year)");
  });
});
