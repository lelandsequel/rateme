/**
 * Tests for GET /api/reps/[id]/historical.
 *
 * Mocking strategy mirrors `src/app/api/notifications/register/route.test.ts`
 * (per AGENTS.md note that this is the canonical pattern in this repo): we
 * vi.mock `@/lib/auth` and `@/lib/prisma` with hand-rolled fakes so we don't
 * spin up next-auth/JWT or a real DB. The route is dynamically imported per
 * call so mock state is read fresh.
 *
 * We don't re-test `monthlyTeamAggregates` correctness here — that lives in
 * `src/lib/manager-historical.test.ts`. We just check:
 *   - 401 on missing session
 *   - 404 on unknown id / non-REP role
 *   - 200 + 12 buckets on happy path
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockSession:
  | { user: { id: string; email: string; name: string; role: string } }
  | null = {
    user: { id: "viewer-1", email: "v@x.com", name: "Viewer", role: "REP" },
  };

vi.mock("@/lib/auth", () => ({
  requireSession: vi.fn(async () => {
    if (!mockSession?.user) {
      throw new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }
    return mockSession;
  }),
}));

type FakeUser = { id: string; role: string };
type FakeRating = {
  /** Per-rating mean score (every answer set to this). */
  score: number;
  createdAt: Date;
  repUserId: string;
};

const dbState: { users: FakeUser[]; ratings: FakeRating[] } = {
  users: [],
  ratings: [],
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(
        async (args: { where: { id: string }; select?: unknown }) => {
          const u = dbState.users.find((x) => x.id === args.where.id);
          return u ? { id: u.id, role: u.role } : null;
        },
      ),
    },
    rating: {
      findMany: vi.fn(
        async (args: {
          where: { repUserId: string; createdAt: { gte: Date } };
        }) => {
          return dbState.ratings
            .filter(
              (r) =>
                r.repUserId === args.where.repUserId &&
                r.createdAt.getTime() >= args.where.createdAt.gte.getTime(),
            )
            // Mock the `select: { answers: { select: { score } } }` shape.
            .map((r) => ({
              createdAt: r.createdAt,
              answers: Array.from({ length: 5 }, () => ({ score: r.score })),
            }));
        },
      ),
    },
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function callRoute(id: string): Promise<Response> {
  const mod = await import("./route");
  return mod.GET(
    new Request(`http://localhost/api/reps/${id}/historical`),
    { params: Promise.resolve({ id }) },
  );
}

function rating(repUserId: string, monthsAgo: number): FakeRating {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - monthsAgo);
  d.setUTCDate(15);
  return { score: 4, createdAt: d, repUserId };
}

beforeEach(() => {
  mockSession = {
    user: { id: "viewer-1", email: "v@x.com", name: "Viewer", role: "REP" },
  };
  dbState.users = [
    { id: "rep-1", role: "REP" },
    { id: "rater-1", role: "RATER" },
    { id: "mgr-1", role: "SALES_MANAGER" },
  ];
  dbState.ratings = [];
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/reps/[id]/historical", () => {
  it("returns 401 when there is no session", async () => {
    mockSession = null;
    const res = await callRoute("rep-1");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 for an unknown id", async () => {
    const res = await callRoute("does-not-exist");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 404 when the user is a RATER (not a REP)", async () => {
    const res = await callRoute("rater-1");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 404 when the user is a SALES_MANAGER (not a REP)", async () => {
    const res = await callRoute("mgr-1");
    expect(res.status).toBe(404);
  });

  it("returns 404 for an invalid id shape (defensive)", async () => {
    const res = await callRoute("not a valid id with spaces");
    expect(res.status).toBe(404);
  });

  it("returns 200 with 12 monthly buckets oldest → newest", async () => {
    const res = await callRoute("rep-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.monthly)).toBe(true);
    expect(body.monthly.length).toBe(12);
    // Oldest bucket comes first; sanity-check ordering by Date.parse.
    const months = body.monthly.map((b: { monthStart: string }) =>
      Date.parse(b.monthStart),
    );
    for (let i = 1; i < months.length; i++) {
      expect(months[i]).toBeGreaterThan(months[i - 1]);
    }
    // No ratings seeded → all buckets are empty.
    expect(body.monthly.every((b: { ratingCount: number }) => b.ratingCount === 0)).toBe(true);
    expect(body.monthly.every((b: { avgOverall: number | null }) => b.avgOverall === null)).toBe(true);
  });

  it("buckets in-window ratings and ignores out-of-window ratings", async () => {
    dbState.ratings = [
      rating("rep-1", 0),  // current month
      rating("rep-1", 0),  // current month
      rating("rep-1", 2),  // 2 months back
      rating("rep-1", 20), // way outside the 13-month query window — never returned by prisma.findMany mock
    ];

    const res = await callRoute("rep-1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      monthly: Array<{ ratingCount: number; avgOverall: number | null }>;
    };
    const totalCount = body.monthly.reduce((a, b) => a + b.ratingCount, 0);
    // Only the 3 in-window ratings should be reflected.
    expect(totalCount).toBe(3);
    // Current month (last bucket) has 2 ratings, all 4s → avg 4.
    expect(body.monthly[11].ratingCount).toBe(2);
    expect(body.monthly[11].avgOverall).toBe(4);
  });
});
