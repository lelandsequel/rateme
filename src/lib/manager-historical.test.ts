import { describe, it, expect } from "vitest";
import {
  monthlyTeamAggregates,
  memberMonthlyDeltas,
} from "./manager-historical";

function r(yyyymm: string, dims = 4): {
  responsiveness: number;
  productKnowledge: number;
  followThrough: number;
  listeningNeedsFit: number;
  trustIntegrity: number;
  createdAt: Date;
} {
  return {
    responsiveness: dims,
    productKnowledge: dims,
    followThrough: dims,
    listeningNeedsFit: dims,
    trustIntegrity: dims,
    createdAt: new Date(`${yyyymm}-15T12:00:00Z`),
  };
}

const NOW = new Date("2026-05-15T00:00:00Z");

describe("monthlyTeamAggregates", () => {
  it("returns 12 buckets ending in the current month", () => {
    const out = monthlyTeamAggregates([], 12, NOW);
    expect(out).toHaveLength(12);
    expect(out[11].monthStart.getUTCMonth()).toBe(4); // May (0-indexed)
    expect(out[0].monthStart.getUTCMonth()).toBe(5); // June (12 months back from May 2026 is June 2025)
    expect(out[0].monthStart.getUTCFullYear()).toBe(2025);
  });

  it("empty inputs → all-null avgOverall, count 0", () => {
    const out = monthlyTeamAggregates([], 12, NOW);
    for (const b of out) {
      expect(b.avgOverall).toBeNull();
      expect(b.ratingCount).toBe(0);
    }
  });

  it("buckets ratings into correct month", () => {
    const out = monthlyTeamAggregates(
      [r("2026-05", 4), r("2026-05", 5), r("2026-04", 3)],
      12,
      NOW,
    );
    expect(out[11].ratingCount).toBe(2); // May
    expect(out[11].avgOverall).toBe(4.5); // (4+5)/2
    expect(out[10].ratingCount).toBe(1); // April
    expect(out[10].avgOverall).toBe(3);
  });

  it("ignores ratings outside the 12-month window", () => {
    const out = monthlyTeamAggregates(
      [r("2024-01", 5), r("2026-05", 4)],
      12,
      NOW,
    );
    expect(out[11].ratingCount).toBe(1);
    expect(out.reduce((a, b) => a + b.ratingCount, 0)).toBe(1);
  });
});

describe("memberMonthlyDeltas", () => {
  const members = [
    { id: "u1", name: "Ali" },
    { id: "u2", name: "Sara" },
    { id: "u3", name: "Mike" },
  ];

  it("returns one entry per member", () => {
    const out = memberMonthlyDeltas([], members, NOW);
    expect(out).toHaveLength(3);
    expect(out.map((m) => m.memberId)).toEqual(["u1", "u2", "u3"]);
  });

  it("computes current/prior/delta correctly", () => {
    const ratings = [
      { ...r("2026-05", 5), memberId: "u1" },
      { ...r("2026-05", 4), memberId: "u1" },
      { ...r("2026-04", 3), memberId: "u1" },
      { ...r("2026-04", 5), memberId: "u2" }, // only last month
      { ...r("2026-05", 4), memberId: "u3" }, // only this month
    ];
    const out = memberMonthlyDeltas(ratings, members, NOW);
    const u1 = out.find((m) => m.memberId === "u1")!;
    expect(u1.avgOverallThisMonth).toBe(4.5);
    expect(u1.avgOverallLastMonth).toBe(3);
    expect(u1.delta).toBe(1.5);
    expect(u1.deltaPct).toBe(50);

    const u2 = out.find((m) => m.memberId === "u2")!;
    expect(u2.avgOverallThisMonth).toBeNull();
    expect(u2.avgOverallLastMonth).toBe(5);
    expect(u2.delta).toBeNull();

    const u3 = out.find((m) => m.memberId === "u3")!;
    expect(u3.avgOverallThisMonth).toBe(4);
    expect(u3.avgOverallLastMonth).toBeNull();
    expect(u3.delta).toBeNull();
  });

  it("members with no ratings in window get nulls", () => {
    const out = memberMonthlyDeltas([], members, NOW);
    for (const m of out) {
      expect(m.avgOverallThisMonth).toBeNull();
      expect(m.avgOverallLastMonth).toBeNull();
      expect(m.delta).toBeNull();
      expect(m.deltaPct).toBeNull();
    }
  });
});
