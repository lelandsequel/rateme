/**
 * Tests for response-timing helpers.
 *
 * We focus on the pure functions (meanHours, connectionDeltasMs,
 * ratingFulfillmentDeltasMs, formatHrs) and a thin smoke test of
 * repResponseTiming + raterResponseTiming wired against a hand-rolled
 * prisma stub — same pattern as src/app/api/notifications/register/route.test.ts.
 */

import { describe, it, expect } from "vitest";
import {
  meanHours,
  connectionDeltasMs,
  ratingFulfillmentDeltasMs,
  formatHrs,
  repResponseTiming,
  raterResponseTiming,
} from "./response-timing";

const HOUR = 1000 * 60 * 60;

describe("meanHours", () => {
  it("returns null on empty input", () => {
    expect(meanHours([])).toBeNull();
  });
  it("averages and rounds to 1 decimal", () => {
    // 1h, 2h, 4h — mean 7/3 ≈ 2.333... → 2.3
    expect(meanHours([1 * HOUR, 2 * HOUR, 4 * HOUR])).toBe(2.3);
  });
  it("handles a single delta", () => {
    expect(meanHours([90 * 60 * 1000])).toBe(1.5);
  });
});

describe("connectionDeltasMs", () => {
  it("drops un-responded rows", () => {
    const out = connectionDeltasMs([
      { requestedAt: new Date("2026-04-01T00:00:00Z"), respondedAt: null },
      {
        requestedAt: new Date("2026-04-01T00:00:00Z"),
        respondedAt: new Date("2026-04-01T03:00:00Z"),
      },
    ]);
    expect(out).toEqual([3 * HOUR]);
  });
  it("drops clock-skew rows where respondedAt < requestedAt", () => {
    const out = connectionDeltasMs([
      {
        requestedAt: new Date("2026-04-02T00:00:00Z"),
        respondedAt: new Date("2026-04-01T00:00:00Z"),
      },
    ]);
    expect(out).toEqual([]);
  });
});

describe("ratingFulfillmentDeltasMs", () => {
  it("drops requests with no linked rating", () => {
    const out = ratingFulfillmentDeltasMs([
      { createdAt: new Date("2026-04-01T00:00:00Z"), rating: null },
      {
        createdAt: new Date("2026-04-01T00:00:00Z"),
        rating: { createdAt: new Date("2026-04-01T05:00:00Z") },
      },
    ]);
    expect(out).toEqual([5 * HOUR]);
  });
});

describe("formatHrs", () => {
  it("renders em-dash on null", () => {
    expect(formatHrs(null)).toBe("—");
  });
  it("uses minutes under an hour", () => {
    expect(formatHrs(0.5)).toBe("30m");
  });
  it("uses h between 1 and 48", () => {
    expect(formatHrs(3.1)).toBe("3.1h");
    expect(formatHrs(47.9)).toBe("47.9h");
  });
  it("uses d at 48h+", () => {
    expect(formatHrs(48)).toBe("2.0d");
    expect(formatHrs(72)).toBe("3.0d");
  });
});

// ---------------------------------------------------------------------------
// repResponseTiming / raterResponseTiming integration smoke tests with a
// hand-rolled prisma stub. We don't validate prisma's WHERE language — we
// just confirm the helpers thread through and aggregate correctly, AND
// that the where clause we pass scopes by user id + status correctly.
// ---------------------------------------------------------------------------

interface ConnRow {
  repUserId: string;
  raterUserId: string;
  status: string;
  requestedAt: Date;
  respondedAt: Date | null;
}
interface ReqRow {
  forRepUserId: string;
  toRaterUserId: string | null;
  status: string;
  createdAt: Date;
  rating: { createdAt: Date } | null;
}

function makeFakePrisma(connections: ConnRow[], requests: ReqRow[]) {
  return {
    connection: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        const w = args.where;
        return connections
          .filter((c) => {
            if (typeof w.repUserId === "string" && c.repUserId !== w.repUserId) return false;
            if (typeof w.raterUserId === "string" && c.raterUserId !== w.raterUserId) return false;
            if (typeof w.status === "string" && c.status !== w.status) return false;
            // crude: respondedAt: { not: null }
            if (w.respondedAt && c.respondedAt === null) return false;
            return true;
          })
          .map((c) => ({ requestedAt: c.requestedAt, respondedAt: c.respondedAt }));
      },
    },
    ratingRequest: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        const w = args.where;
        return requests
          .filter((r) => {
            if (typeof w.forRepUserId === "string" && r.forRepUserId !== w.forRepUserId) return false;
            if (typeof w.toRaterUserId === "string" && r.toRaterUserId !== w.toRaterUserId) return false;
            if (typeof w.status === "string" && r.status !== w.status) return false;
            if (w.rating && r.rating === null) return false;
            return true;
          })
          .map((r) => ({ createdAt: r.createdAt, rating: r.rating }));
      },
    },
  };
}

describe("repResponseTiming", () => {
  it("returns nulls + zero counts when there's no data", async () => {
    const stats = await repResponseTiming(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeFakePrisma([], []) as any,
      "rep-1",
    );
    expect(stats).toEqual({
      avgConnectionResponseHrs: null,
      avgRatingFulfillmentHrs: null,
      countConnectionResponses: 0,
      countRatingFulfillments: 0,
    });
  });

  it("averages connection response time for ACCEPTED responded rows only", async () => {
    const t0 = new Date("2026-04-01T00:00:00Z");
    const conns: ConnRow[] = [
      // Counts: ACCEPTED + responded after 2h
      {
        repUserId: "rep-1",
        raterUserId: "r-a",
        status: "ACCEPTED",
        requestedAt: t0,
        respondedAt: new Date(t0.getTime() + 2 * HOUR),
      },
      // Counts: ACCEPTED + responded after 4h
      {
        repUserId: "rep-1",
        raterUserId: "r-b",
        status: "ACCEPTED",
        requestedAt: t0,
        respondedAt: new Date(t0.getTime() + 4 * HOUR),
      },
      // Excluded: PENDING (status filter)
      {
        repUserId: "rep-1",
        raterUserId: "r-c",
        status: "PENDING",
        requestedAt: t0,
        respondedAt: null,
      },
      // Excluded: different rep
      {
        repUserId: "rep-2",
        raterUserId: "r-a",
        status: "ACCEPTED",
        requestedAt: t0,
        respondedAt: new Date(t0.getTime() + 100 * HOUR),
      },
    ];
    const stats = await repResponseTiming(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeFakePrisma(conns, []) as any,
      "rep-1",
    );
    expect(stats.avgConnectionResponseHrs).toBe(3); // mean of 2 and 4
    expect(stats.countConnectionResponses).toBe(2);
    expect(stats.avgRatingFulfillmentHrs).toBeNull();
    expect(stats.countRatingFulfillments).toBe(0);
  });

  it("averages rating-request fulfillment time only for COMPLETED requests with a linked rating", async () => {
    const t0 = new Date("2026-04-01T00:00:00Z");
    const reqs: ReqRow[] = [
      {
        forRepUserId: "rep-1",
        toRaterUserId: "r-a",
        status: "COMPLETED",
        createdAt: t0,
        rating: { createdAt: new Date(t0.getTime() + 6 * HOUR) },
      },
      {
        forRepUserId: "rep-1",
        toRaterUserId: "r-b",
        status: "COMPLETED",
        createdAt: t0,
        rating: { createdAt: new Date(t0.getTime() + 12 * HOUR) },
      },
      // Different rep — excluded
      {
        forRepUserId: "rep-2",
        toRaterUserId: "r-a",
        status: "COMPLETED",
        createdAt: t0,
        rating: { createdAt: new Date(t0.getTime() + 1 * HOUR) },
      },
    ];
    const stats = await repResponseTiming(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeFakePrisma([], reqs) as any,
      "rep-1",
    );
    expect(stats.avgRatingFulfillmentHrs).toBe(9); // mean of 6 and 12
    expect(stats.countRatingFulfillments).toBe(2);
  });
});

describe("raterResponseTiming", () => {
  it("scopes by raterUserId + toRaterUserId", async () => {
    const t0 = new Date("2026-04-01T00:00:00Z");
    const conns: ConnRow[] = [
      {
        repUserId: "rep-x",
        raterUserId: "rater-1",
        status: "ACCEPTED",
        requestedAt: t0,
        respondedAt: new Date(t0.getTime() + 8 * HOUR),
      },
      // Different rater — excluded
      {
        repUserId: "rep-x",
        raterUserId: "rater-2",
        status: "ACCEPTED",
        requestedAt: t0,
        respondedAt: new Date(t0.getTime() + 1 * HOUR),
      },
    ];
    const reqs: ReqRow[] = [
      {
        forRepUserId: "rep-x",
        toRaterUserId: "rater-1",
        status: "COMPLETED",
        createdAt: t0,
        rating: { createdAt: new Date(t0.getTime() + 24 * HOUR) },
      },
    ];
    const stats = await raterResponseTiming(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeFakePrisma(conns, reqs) as any,
      "rater-1",
    );
    expect(stats.avgConnectionResponseHrs).toBe(8);
    expect(stats.countConnectionResponses).toBe(1);
    expect(stats.avgRatingFulfillmentHrs).toBe(24);
    expect(stats.countRatingFulfillments).toBe(1);
  });
});
