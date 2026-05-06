import { describe, it, expect } from "vitest";
import {
  aggregateRatings,
  ratingsCountForStatus,
  statusFromYearlyCount,
  type RatingForAgg,
} from "./aggregates";

function rating(overrides: Partial<RatingForAgg> = {}): RatingForAgg {
  return {
    responsiveness: 5,
    productKnowledge: 5,
    followThrough: 5,
    listeningNeedsFit: 5,
    trustIntegrity: 5,
    takeCallAgain: true,
    createdAt: new Date("2026-05-01T00:00:00Z"),
    ...overrides,
  };
}

describe("statusFromYearlyCount", () => {
  it("returns Verified for 0", () => {
    expect(statusFromYearlyCount(0)).toBe("Verified");
  });
  it("returns Verified just below the Trusted threshold", () => {
    expect(statusFromYearlyCount(24)).toBe("Verified");
  });
  it("returns Trusted at exactly 25", () => {
    expect(statusFromYearlyCount(25)).toBe("Trusted");
  });
  it("returns Preferred at 50", () => {
    expect(statusFromYearlyCount(50)).toBe("Preferred");
  });
  it("returns ELITE at 100", () => {
    expect(statusFromYearlyCount(100)).toBe("ELITE");
  });
  it("returns ELITE+ at 500", () => {
    expect(statusFromYearlyCount(500)).toBe("ELITE+");
  });
  it("returns ELITE+ for absurdly high counts", () => {
    expect(statusFromYearlyCount(10_000)).toBe("ELITE+");
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
  it("returns Verified + null aggregates for an empty list", () => {
    const a = aggregateRatings([]);
    expect(a.ratingCount).toBe(0);
    expect(a.averages).toBeNull();
    expect(a.takeCallAgainPct).toBeNull();
    expect(a.overall).toBeNull();
    expect(a.status).toBe("Verified");
  });

  it("computes correct averages and takeCallAgain%", () => {
    const a = aggregateRatings([
      rating({ responsiveness: 5, takeCallAgain: true }),
      rating({ responsiveness: 3, takeCallAgain: false }),
      rating({ responsiveness: 4, takeCallAgain: true }),
    ]);
    expect(a.ratingCount).toBe(3);
    expect(a.averages?.responsiveness).toBe(4); // (5+3+4)/3
    expect(a.takeCallAgainPct).toBe(67); // 2/3
  });

  it("computes overall as the mean of dimension averages", () => {
    const a = aggregateRatings([
      rating({
        responsiveness: 4,
        productKnowledge: 4,
        followThrough: 4,
        listeningNeedsFit: 4,
        trustIntegrity: 4,
      }),
    ]);
    expect(a.overall).toBe(4);
  });

  it("rolls up to the right status for the rating volume", () => {
    const ratings: RatingForAgg[] = [];
    for (let i = 0; i < 30; i++) {
      ratings.push(rating());
    }
    // 30 ratings in current year (May 2026), no grace consideration.
    const a = aggregateRatings(ratings, new Date("2026-05-15T00:00:00Z"));
    expect(a.ratingsThisYear).toBe(30);
    expect(a.status).toBe("Trusted");
  });
});
