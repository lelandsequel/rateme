/**
 * Tests for GET /api/team/historical.
 *
 * Same mocking posture as the other route tests in this repo (see
 * `src/app/api/notifications/register/route.test.ts` for the canonical
 * pattern):
 *   - `@/lib/auth.requireRole` is stubbed.
 *   - `@/lib/prisma` is a hand-rolled in-memory fake exposing only the
 *     surface the route actually calls (user.findUnique, teamMembership.
 *     findMany, rating.findMany, rating.count, ratingRequest.groupBy).
 *
 * The point of this test file is the THREE NEW fields shipped in Phase 8-A:
 *   - resolutionRate
 *   - requestsSentByRep
 *   - engagement
 *
 * `monthly` and `memberDeltas` get smoke-tested to make sure we didn't
 * regress them; their math is covered by `src/lib/manager-historical.test.ts`.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Default: a SALES_MANAGER (REP_MANAGER) named "mgr-1".
let mockSession:
  | { user: { id: string; email: string; name: string; role: string } }
  | null = {
    user: {
      id: "mgr-1",
      email: "m@x.com",
      name: "M",
      role: "SALES_MANAGER",
    },
  };

vi.mock("@/lib/auth", () => ({
  requireRole: vi.fn(async (..._allowed: string[]) => {
    if (!mockSession?.user) {
      throw new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }
    return mockSession;
  }),
}));

type FakeManagerProfile = { managesType: "REP_MANAGER" | "RATER_MANAGER" };
type FakeUser = { id: string; managerProfile: FakeManagerProfile | null };
type FakeMembership = {
  managerId: string;
  memberId: string;
  member: { id: string; name: string };
  acceptedAt: Date | null;
  endedAt: Date | null;
};
type FakeRating = {
  /** Per-rating mean score (every answer set to this). */
  score: number;
  /** Optional per-question overrides — used by the resolution-rate test. */
  scoreOverrides?: Partial<Record<string, number>>;
  createdAt: Date;
  repUserId: string;
  raterUserId: string;
};
type FakeRequest = {
  forRepUserId: string;
  toRaterUserId: string | null;
  createdAt: Date;
};

const dbState: {
  users: FakeUser[];
  memberships: FakeMembership[];
  ratings: FakeRating[];
  ratingRequests: FakeRequest[];
} = {
  users: [],
  memberships: [],
  ratings: [],
  ratingRequests: [],
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(
        async (args: { where: { id: string } }) => {
          const u = dbState.users.find((x) => x.id === args.where.id);
          return u
            ? { managerProfile: u.managerProfile }
            : null;
        },
      ),
    },
    teamMembership: {
      findMany: vi.fn(
        async (args: {
          where: {
            managerId: string;
            acceptedAt: { not: null };
            endedAt: null;
          };
        }) => {
          return dbState.memberships
            .filter(
              (m) =>
                m.managerId === args.where.managerId &&
                m.acceptedAt !== null &&
                m.endedAt === null,
            )
            .map((m) => ({
              memberId: m.memberId,
              member: m.member,
            }));
        },
      ),
    },
    rating: {
      findMany: vi.fn(
        async (args: {
          where:
            | { repUserId: { in: string[] }; createdAt: { gte: Date } }
            | { raterUserId: { in: string[] }; createdAt: { gte: Date } };
        }) => {
          const ids =
            "repUserId" in args.where
              ? args.where.repUserId.in
              : args.where.raterUserId.in;
          const isRepScope = "repUserId" in args.where;
          return dbState.ratings
            .filter((r) => {
              const memberId = isRepScope ? r.repUserId : r.raterUserId;
              return (
                ids.includes(memberId) &&
                r.createdAt.getTime() >= args.where.createdAt.gte.getTime()
              );
            })
            // Mock the prisma `select: { answers: { ... } }` projection.
            // Each answer carries a question stub for the per-question helpers.
            .map((r) => {
              const QKEYS = ["a", "b", "c", "d", "e"];
              const answers = QKEYS.map((k, i) => ({
                score: r.scoreOverrides?.[k] ?? r.score,
                question: { key: k, labelEn: `Q${k.toUpperCase()}`, ord: i },
              }));
              return {
                createdAt: r.createdAt,
                repUserId: r.repUserId,
                raterUserId: r.raterUserId,
                answers,
              };
            });
        },
      ),
      count: vi.fn(
        async (args: {
          where:
            | { repUserId: { in: string[] }; createdAt: { gte: Date } }
            | { raterUserId: { in: string[] }; createdAt: { gte: Date } };
        }) => {
          const ids =
            "repUserId" in args.where
              ? args.where.repUserId.in
              : args.where.raterUserId.in;
          const isRepScope = "repUserId" in args.where;
          return dbState.ratings.filter((r) => {
            const memberId = isRepScope ? r.repUserId : r.raterUserId;
            return (
              ids.includes(memberId) &&
              r.createdAt.getTime() >= args.where.createdAt.gte.getTime()
            );
          }).length;
        },
      ),
    },
    ratingRequest: {
      groupBy: vi.fn(
        async (args: {
          by: ["forRepUserId"] | ["toRaterUserId"];
          where:
            | { forRepUserId: { in: string[] }; createdAt: { gte: Date } }
            | { toRaterUserId: { in: string[] }; createdAt: { gte: Date } };
          _count: { _all: true };
        }) => {
          const isRepScope = args.by[0] === "forRepUserId";
          const ids =
            "forRepUserId" in args.where
              ? args.where.forRepUserId.in
              : args.where.toRaterUserId.in;
          const cutoff = args.where.createdAt.gte.getTime();
          const counts = new Map<string, number>();
          for (const rr of dbState.ratingRequests) {
            if (rr.createdAt.getTime() < cutoff) continue;
            const key = isRepScope ? rr.forRepUserId : rr.toRaterUserId ?? "";
            if (!key || !ids.includes(key)) continue;
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
          return Array.from(counts.entries()).map(([k, v]) =>
            isRepScope
              ? { forRepUserId: k, _count: { _all: v } }
              : { toRaterUserId: k, _count: { _all: v } },
          );
        },
      ),
    },
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function callRoute(): Promise<Response> {
  const mod = await import("./route");
  return mod.GET();
}

function recentDate(daysAgo: number): Date {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
}

function rating(
  repUserId: string,
  raterUserId: string,
  daysAgo: number,
  score: number = 4,
): FakeRating {
  return { score, createdAt: recentDate(daysAgo), repUserId, raterUserId };
}

beforeEach(() => {
  mockSession = {
    user: {
      id: "mgr-1",
      email: "m@x.com",
      name: "M",
      role: "SALES_MANAGER",
    },
  };
  dbState.users = [
    {
      id: "mgr-1",
      managerProfile: { managesType: "REP_MANAGER" },
    },
  ];
  dbState.memberships = [];
  dbState.ratings = [];
  dbState.ratingRequests = [];
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/team/historical (extended fields)", () => {
  it("returns empty/zero shapes when the manager has no team", async () => {
    const res = await callRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.memberDeltas).toEqual([]);
    expect(body.monthly.length).toBe(12);
    expect(body.resolutionRate).toEqual({
      atRiskPairs: 0,
      resolvedPairs: 0,
      rate: null,
    });
    expect(body.requestsSentByRep).toEqual([]);
    expect(body.engagement).toEqual({
      requestsSent: 0,
      ratingsReceived: 0,
      pct: null,
    });
  });

  it("returns 400 when the manager has no managerProfile", async () => {
    dbState.users = [{ id: "mgr-1", managerProfile: null }];
    const res = await callRoute();
    expect(res.status).toBe(400);
  });

  it("computes requestsSentByRep + zero entries for members with no requests", async () => {
    dbState.memberships = [
      {
        managerId: "mgr-1",
        memberId: "rep-A",
        member: { id: "rep-A", name: "Alice" },
        acceptedAt: new Date("2026-01-01"),
        endedAt: null,
      },
      {
        managerId: "mgr-1",
        memberId: "rep-B",
        member: { id: "rep-B", name: "Bob" },
        acceptedAt: new Date("2026-01-01"),
        endedAt: null,
      },
    ];
    dbState.ratingRequests = [
      { forRepUserId: "rep-A", toRaterUserId: null, createdAt: recentDate(5) },
      { forRepUserId: "rep-A", toRaterUserId: null, createdAt: recentDate(40) },
      { forRepUserId: "rep-A", toRaterUserId: null, createdAt: recentDate(120) }, // outside 90d
      // Bob: no requests
    ];

    const res = await callRoute();
    const body = await res.json();
    expect(body.requestsSentByRep).toEqual(
      expect.arrayContaining([
        { memberId: "rep-A", name: "Alice", sent: 2 },
        { memberId: "rep-B", name: "Bob", sent: 0 },
      ]),
    );
    expect(body.requestsSentByRep.length).toBe(2);
  });

  it('engagement pct = round(ratingsReceived/requestsSent * 100) — client example "30 sent, 5 rated → 16%"', async () => {
    dbState.memberships = [
      {
        managerId: "mgr-1",
        memberId: "rep-A",
        member: { id: "rep-A", name: "Alice" },
        acceptedAt: new Date("2026-01-01"),
        endedAt: null,
      },
    ];
    // 30 requests in window
    dbState.ratingRequests = Array.from({ length: 30 }, (_, i) => ({
      forRepUserId: "rep-A",
      toRaterUserId: null,
      createdAt: recentDate(10 + (i % 30)),
    }));
    // 5 ratings received in window (paired with distinct raters so resolutionRate stays 0/0)
    dbState.ratings = Array.from({ length: 5 }, (_, i) =>
      rating("rep-A", `rater-${i}`, 5 + i),
    );

    const res = await callRoute();
    const body = await res.json();
    expect(body.engagement.requestsSent).toBe(30);
    expect(body.engagement.ratingsReceived).toBe(5);
    // 5/30 = 16.66... → 17 (Math.round). Per client spec the value should be
    // an INTEGER pct; the 16% in the brief is an approximation, not a strict
    // assertion of rounding direction.
    expect(body.engagement.pct).toBe(17);
  });

  it("engagement.pct is null when no requests sent", async () => {
    dbState.memberships = [
      {
        managerId: "mgr-1",
        memberId: "rep-A",
        member: { id: "rep-A", name: "Alice" },
        acceptedAt: new Date("2026-01-01"),
        endedAt: null,
      },
    ];
    // No requests, but a stray rating exists.
    dbState.ratings = [rating("rep-A", "rater-x", 10)];

    const res = await callRoute();
    const body = await res.json();
    expect(body.engagement.requestsSent).toBe(0);
    expect(body.engagement.pct).toBeNull();
  });

  it("resolutionRate counts at-risk pairs and follow-up resolutions", async () => {
    dbState.memberships = [
      {
        managerId: "mgr-1",
        memberId: "rep-A",
        member: { id: "rep-A", name: "Alice" },
        acceptedAt: new Date("2026-01-01"),
        endedAt: null,
      },
    ];
    // (rep-A, rater-1): first rating has a 2 (at-risk), second is all 5s within 60d → resolved.
    dbState.ratings = [
      { ...rating("rep-A", "rater-1", 50), scoreOverrides: { a: 2 } },
      rating("rep-A", "rater-1", 10, 5),
      // (rep-A, rater-2): single at-risk rating, no follow-up → at-risk but unresolved.
      { ...rating("rep-A", "rater-2", 30), scoreOverrides: { e: 3 } },
    ];

    const res = await callRoute();
    const body = await res.json();
    expect(body.resolutionRate.atRiskPairs).toBe(2);
    expect(body.resolutionRate.resolvedPairs).toBe(1);
    expect(body.resolutionRate.rate).toBe(0.5);
  });

  it("RATER_MANAGER scope counts requests addressed to raters", async () => {
    mockSession = {
      user: {
        id: "mgr-1",
        email: "m@x.com",
        name: "M",
        role: "RATER_MANAGER",
      },
    };
    dbState.users = [
      {
        id: "mgr-1",
        managerProfile: { managesType: "RATER_MANAGER" },
      },
    ];
    dbState.memberships = [
      {
        managerId: "mgr-1",
        memberId: "rater-A",
        member: { id: "rater-A", name: "Rita" },
        acceptedAt: new Date("2026-01-01"),
        endedAt: null,
      },
    ];
    dbState.ratingRequests = [
      { forRepUserId: "rep-X", toRaterUserId: "rater-A", createdAt: recentDate(2) },
      { forRepUserId: "rep-Y", toRaterUserId: "rater-A", createdAt: recentDate(50) },
    ];
    dbState.ratings = [
      // Ratings GIVEN by rater-A (raterUserId scope is what matters for RATER_MANAGER).
      rating("rep-X", "rater-A", 1),
    ];

    const res = await callRoute();
    const body = await res.json();
    expect(body.requestsSentByRep).toEqual([
      { memberId: "rater-A", name: "Rita", sent: 2 },
    ]);
    expect(body.engagement.requestsSent).toBe(2);
    expect(body.engagement.ratingsReceived).toBe(1);
    expect(body.engagement.pct).toBe(50);
  });
});
