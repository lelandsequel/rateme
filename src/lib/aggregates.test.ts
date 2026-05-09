import { describe, it, expect } from "vitest";
import {
  aggregateRatings,
  aggregateRaterRatings,
  ratingsCountForStatus,
  statusFromYearlyCount,
  type RatingForAgg,
} from "./aggregates";

// Build a 5-question rating with each question scored to a single number.
// Defaults to all 5s. Pass `scoresByKey` for finer control.
function rating(
  opts: {
    score?: number;
    scoresByKey?: Partial<Record<string, number>>;
    createdAt?: Date;
  } = {},
): RatingForAgg {
  const base = opts.score ?? 5;
  const order = ["a", "b", "c", "d", "e"];
  return {
    createdAt: opts.createdAt ?? new Date("2026-05-01T00:00:00Z"),
    answers: order.map((k, i) => ({
      score: opts.scoresByKey?.[k] ?? base,
      question: { key: k, labelEn: `Q${k.toUpperCase()}`, ord: i },
    })),
  };
}

describe("statusFromYearlyCount", () => {
  it("returns Unverified when count is 0 and no avatar", () => {
    expect(statusFromYearlyCount(0, false)).toBe("Unverified");
  });
  it("returns Verified when count is 0 but has avatar", () => {
    expect(statusFromYearlyCount(0, true)).toBe("Verified");
  });
  it("returns Unverified just below the Trusted threshold without avatar", () => {
    expect(statusFromYearlyCount(24, false)).toBe("Unverified");
  });
  it("returns Verified just below the Trusted threshold with avatar", () => {
    expect(statusFromYearlyCount(24, true)).toBe("Verified");
  });
  it("returns Trusted at exactly 25 even without avatar", () => {
    expect(statusFromYearlyCount(25, false)).toBe("Trusted");
  });
  it("returns Trusted at 25 with avatar", () => {
    expect(statusFromYearlyCount(25, true)).toBe("Trusted");
  });
  it("returns Preferred at 50", () => {
    expect(statusFromYearlyCount(50, true)).toBe("Preferred");
  });
  it("returns ELITE at 100", () => {
    expect(statusFromYearlyCount(100, true)).toBe("ELITE");
  });
  it("returns ELITE+ at 500", () => {
    expect(statusFromYearlyCount(500, true)).toBe("ELITE+");
  });
  it("returns ELITE+ for absurdly high counts", () => {
    expect(statusFromYearlyCount(10_000, false)).toBe("ELITE+");
  });
});

describe("ratingsCountForStatus", () => {
  it("sums only current-year ratings outside grace period", () => {
    const now = new Date("2026-06-15T00:00:00Z"); // not in Jan-Mar
    const ratings = [
      { createdAt: new Date("2026-01-15T00:00:00Z") },
      { createdAt: new Date("2026-04-15T00:00:00Z") },
      { createdAt: new Date("2025-12-31T00:00:00Z") }, // prior year, ignored
    ];
    expect(ratingsCountForStatus(ratings, now)).toBe(2);
  });

  it("includes prior-year ratings during Jan-Mar grace period", () => {
    const now = new Date("2026-02-10T00:00:00Z"); // in grace
    const ratings = [
      { createdAt: new Date("2025-11-15T00:00:00Z") },
      { createdAt: new Date("2025-12-31T00:00:00Z") },
      { createdAt: new Date("2026-01-15T00:00:00Z") },
    ];
    // Grace: max(current=1, current+prior=3) = 3
    expect(ratingsCountForStatus(ratings, now)).toBe(3);
  });

  it("doesn't include ratings older than prior year", () => {
    const now = new Date("2026-02-10T00:00:00Z");
    const ratings = [
      { createdAt: new Date("2024-11-15T00:00:00Z") }, // 2 years old, ignored
      { createdAt: new Date("2026-01-15T00:00:00Z") },
    ];
    expect(ratingsCountForStatus(ratings, now)).toBe(1);
  });
});

describe("aggregateRatings", () => {
  it("returns Unverified for an empty list with no avatar", () => {
    const a = aggregateRatings([], null);
    expect(a.ratingCount).toBe(0);
    expect(a.perQuestion).toBeNull();
    expect(a.overall).toBeNull();
    expect(a.overall10).toBeNull();
    expect(a.status).toBe("Unverified");
  });

  it("returns Verified for an empty list when an avatar is set", () => {
    const a = aggregateRatings([], "https://example.com/me.png");
    expect(a.status).toBe("Verified");
  });

  it("rolls past Unverified once Trusted threshold hit, even without avatar", () => {
    const ratings: RatingForAgg[] = [];
    for (let i = 0; i < 25; i++) ratings.push(rating());
    const a = aggregateRatings(ratings, null, new Date("2026-05-15T00:00:00Z"));
    expect(a.ratingsThisYear).toBe(25);
    expect(a.status).toBe("Trusted");
  });

  it("computes per-question averages and orders by ord asc", () => {
    const a = aggregateRatings(
      [
        rating({ scoresByKey: { a: 5, b: 3, c: 4, d: 5, e: 5 } }),
        rating({ scoresByKey: { a: 3, b: 3, c: 4, d: 5, e: 5 } }),
        rating({ scoresByKey: { a: 4, b: 3, c: 4, d: 5, e: 5 } }),
      ],
      "avatar.png",
    );
    expect(a.ratingCount).toBe(3);
    expect(a.perQuestion).not.toBeNull();
    const byKey = Object.fromEntries(a.perQuestion!.map((q) => [q.key, q.avg]));
    expect(byKey.a).toBe(4); // (5+3+4)/3
    expect(byKey.b).toBe(3);
    // Order = ord asc.
    expect(a.perQuestion!.map((q) => q.key)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("computes overall + overall10 as the mean of per-rating means", () => {
    const a = aggregateRatings(
      [rating({ score: 4 })], // every q = 4 → mean 4
      "avatar.png",
    );
    expect(a.overall).toBe(4);
    expect(a.overall10).toBe(8); // 4 * 2 = 8.00
  });

  it("rolls up to the right status for the rating volume", () => {
    const ratings: RatingForAgg[] = [];
    for (let i = 0; i < 30; i++) {
      ratings.push(rating());
    }
    // 30 ratings in current year (May 2026), no grace consideration.
    const a = aggregateRatings(ratings, "avatar.png", new Date("2026-05-15T00:00:00Z"));
    expect(a.ratingsThisYear).toBe(30);
    expect(a.status).toBe("Trusted");
  });
});

describe("aggregateRaterRatings", () => {
  it("returns Verified for a rater with 0 given but an avatar", () => {
    const a = aggregateRaterRatings([], "avatar.png");
    expect(a.ratingsGivenCount).toBe(0);
    expect(a.status).toBe("Verified");
  });

  it("returns Unverified for a rater with 0 given and no avatar", () => {
    const a = aggregateRaterRatings([], null);
    expect(a.status).toBe("Unverified");
  });

  it("counts ratings GIVEN this year for status", () => {
    const given = Array.from({ length: 25 }, () => ({
      createdAt: new Date("2026-04-01T00:00:00Z"),
    }));
    const a = aggregateRaterRatings(given, null, new Date("2026-05-15T00:00:00Z"));
    expect(a.ratingsGivenThisYear).toBe(25);
    expect(a.status).toBe("Trusted");
  });
});
