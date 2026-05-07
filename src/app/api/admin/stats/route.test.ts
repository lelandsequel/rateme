/**
 * Tests for GET /api/admin/stats — happy-path counts.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

let mockSession:
  | { user: { id: string; email: string; name: string; role: string } }
  | null = { user: { id: "admin-1", email: "a@a.com", name: "A", role: "ADMIN" } };

vi.mock("@/lib/auth", () => ({
  requireSession: vi.fn(async () => {
    if (!mockSession) {
      throw new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      });
    }
    return mockSession;
  }),
  requireRole: vi.fn(async (...allowed: string[]) => {
    if (!mockSession) {
      throw new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      });
    }
    if (!allowed.includes(mockSession.user.role)) {
      throw new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
      });
    }
    return mockSession;
  }),
}));

const counts = {
  user: 0,
  connection: 0,
  rating: 0,
  byRole: [] as Array<{ role: string; _count: { _all: number } }>,
  byStatus: [] as Array<{ status: string; _count: { _all: number } }>,
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      count: vi.fn(async () => counts.user),
      groupBy: vi.fn(async () => counts.byRole),
    },
    connection: { count: vi.fn(async () => counts.connection) },
    rating: { count: vi.fn(async () => counts.rating) },
    ratingRequest: {
      groupBy: vi.fn(async () => counts.byStatus),
    },
  },
}));

async function callGet(): Promise<Response> {
  const mod = await import("./route");
  return mod.GET();
}

beforeEach(() => {
  mockSession = {
    user: { id: "admin-1", email: "a@a.com", name: "A", role: "ADMIN" },
  };
  counts.user = 42;
  counts.connection = 17;
  counts.rating = 33;
  counts.byRole = [
    { role: "REP", _count: { _all: 20 } },
    { role: "RATER", _count: { _all: 18 } },
    { role: "ADMIN", _count: { _all: 1 } },
  ];
  counts.byStatus = [
    { status: "PENDING", _count: { _all: 4 } },
    { status: "COMPLETED", _count: { _all: 7 } },
  ];
});

describe("GET /api/admin/stats", () => {
  it("returns 403 when caller is not ADMIN", async () => {
    mockSession = {
      user: { id: "u", email: "u@u.com", name: "U", role: "REP" },
    };
    const res = await callGet();
    expect(res.status).toBe(403);
  });

  it("returns 401 with no session", async () => {
    mockSession = null;
    const res = await callGet();
    expect(res.status).toBe(401);
  });

  it("returns the happy-path counts shape", async () => {
    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalUsers).toBe(42);
    expect(body.totalConnections).toBe(17);
    expect(body.totalRatings).toBe(33);
    // All Role keys present even if zero.
    expect(body.usersByRole.REP).toBe(20);
    expect(body.usersByRole.RATER).toBe(18);
    expect(body.usersByRole.ADMIN).toBe(1);
    expect(body.usersByRole.SALES_MANAGER).toBe(0);
    expect(body.usersByRole.RATER_MANAGER).toBe(0);
    // All RatingRequestStatus keys present even if zero.
    expect(body.ratingRequestsByStatus.PENDING).toBe(4);
    expect(body.ratingRequestsByStatus.COMPLETED).toBe(7);
    expect(body.ratingRequestsByStatus.EXPIRED).toBe(0);
    expect(body.ratingRequestsByStatus.CANCELLED).toBe(0);
  });
});
