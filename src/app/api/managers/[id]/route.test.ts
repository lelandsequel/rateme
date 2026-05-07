/**
 * Tests for GET /api/managers/:id.
 *
 * Mocks @/lib/auth.requireSession + @/lib/prisma with hand-rolled in-memory
 * fakes (matching the project pattern in notifications/register/route.test.ts).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

let mockSession:
  | { user: { id: string; role: string; email?: string; name?: string } }
  | null = { user: { id: "viewer-1", role: "REP" } };

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

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: "REP" | "RATER" | "SALES_MANAGER" | "RATER_MANAGER" | "ADMIN";
  state: string;
  avatarUrl: string | null;
  createdAt: Date;
  managerProfile?: { managesType: "REP_MANAGER" | "RATER_MANAGER"; company: string } | null;
}

interface MembershipRow {
  id: string;
  managerId: string;
  memberId: string;
  acceptedAt: Date | null;
  endedAt: Date | null;
}

interface RatingRow {
  repUserId: string;
  raterUserId: string;
  responsiveness: number;
  productKnowledge: number;
  followThrough: number;
  listeningNeedsFit: number;
  trustIntegrity: number;
  createdAt: Date;
}

const state: {
  users: Record<string, UserRow>;
  memberships: MembershipRow[];
  ratings: RatingRow[];
} = { users: {}, memberships: [], ratings: [] };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(
        async (args: { where: { id: string }; include?: unknown }) => {
          return state.users[args.where.id] ?? null;
        },
      ),
    },
    teamMembership: {
      findMany: vi.fn(
        async (args: {
          where: {
            managerId?: string;
            endedAt?: null;
            acceptedAt?: { not: null };
          };
        }) => {
          const w = args.where;
          return state.memberships.filter((m) => {
            if (w.managerId && m.managerId !== w.managerId) return false;
            if (w.endedAt === null && m.endedAt !== null) return false;
            if (w.acceptedAt && m.acceptedAt === null) return false;
            return true;
          });
        },
      ),
    },
    rating: {
      findMany: vi.fn(
        async (args: {
          where: {
            repUserId?: { in: string[] };
            createdAt?: { gte?: Date };
          };
        }) => {
          const w = args.where;
          return state.ratings.filter((r) => {
            if (w.repUserId?.in && !w.repUserId.in.includes(r.repUserId)) return false;
            if (w.createdAt?.gte && r.createdAt < w.createdAt.gte) return false;
            return true;
          });
        },
      ),
      count: vi.fn(
        async (args: {
          where: {
            raterUserId?: { in: string[] };
            createdAt?: { gte?: Date };
          };
        }) => {
          const w = args.where;
          return state.ratings.filter((r) => {
            if (w.raterUserId?.in && !w.raterUserId.in.includes(r.raterUserId)) return false;
            if (w.createdAt?.gte && r.createdAt < w.createdAt.gte) return false;
            return true;
          }).length;
        },
      ),
    },
  },
}));

async function callRoute(id: string): Promise<Response> {
  const mod = await import("./route");
  return mod.GET(new Request(`http://localhost/api/managers/${id}`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  mockSession = { user: { id: "viewer-1", role: "REP" } };
  state.users = {};
  state.memberships = [];
  state.ratings = [];
});

describe("GET /api/managers/:id", () => {
  it("returns 401 when there is no session", async () => {
    mockSession = null;
    const res = await callRoute("mgr-1");
    expect(res.status).toBe(401);
  });

  it("returns 404 when the user does not exist", async () => {
    const res = await callRoute("nope");
    expect(res.status).toBe(404);
  });

  it("returns 404 when the user is not a manager", async () => {
    state.users["rep-1"] = {
      id: "rep-1",
      email: "rep@x.com",
      name: "Rep",
      role: "REP",
      state: "TX",
      avatarUrl: null,
      createdAt: new Date("2026-01-01"),
      managerProfile: null,
    };
    const res = await callRoute("rep-1");
    expect(res.status).toBe(404);
  });

  it("returns 404 when the user is a manager role but has no managerProfile", async () => {
    state.users["mgr-broken"] = {
      id: "mgr-broken",
      email: "broken@x.com",
      name: "Broken",
      role: "SALES_MANAGER",
      state: "TX",
      avatarUrl: null,
      createdAt: new Date("2026-01-01"),
      managerProfile: null,
    };
    const res = await callRoute("mgr-broken");
    expect(res.status).toBe(404);
  });

  it("returns the SALES_MANAGER shape with team size + 90d avg overall", async () => {
    state.users["mgr-1"] = {
      id: "mgr-1",
      email: "tj@x.com",
      name: "TJ",
      role: "SALES_MANAGER",
      state: "TX",
      avatarUrl: null,
      createdAt: new Date("2026-01-01"),
      managerProfile: { managesType: "REP_MANAGER", company: "Acme" },
    };
    state.memberships = [
      {
        id: "tm-1",
        managerId: "mgr-1",
        memberId: "rep-1",
        acceptedAt: new Date("2026-02-01"),
        endedAt: null,
      },
      {
        id: "tm-2",
        managerId: "mgr-1",
        memberId: "rep-2",
        acceptedAt: new Date("2026-02-01"),
        endedAt: null,
      },
      // ended membership — must be excluded
      {
        id: "tm-3",
        managerId: "mgr-1",
        memberId: "rep-3",
        acceptedAt: new Date("2026-01-01"),
        endedAt: new Date("2026-03-01"),
      },
      // pending — must be excluded
      {
        id: "tm-4",
        managerId: "mgr-1",
        memberId: "rep-4",
        acceptedAt: null,
        endedAt: null,
      },
    ];
    state.ratings = [
      {
        repUserId: "rep-1",
        raterUserId: "rater-x",
        responsiveness: 5,
        productKnowledge: 5,
        followThrough: 5,
        listeningNeedsFit: 5,
        trustIntegrity: 5,
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
      {
        repUserId: "rep-2",
        raterUserId: "rater-y",
        responsiveness: 3,
        productKnowledge: 3,
        followThrough: 3,
        listeningNeedsFit: 3,
        trustIntegrity: 3,
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      },
      // Outside 90d — excluded
      {
        repUserId: "rep-1",
        raterUserId: "rater-z",
        responsiveness: 1,
        productKnowledge: 1,
        followThrough: 1,
        listeningNeedsFit: 1,
        trustIntegrity: 1,
        createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
      },
    ];

    const res = await callRoute("mgr-1");
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.id).toBe("mgr-1");
    expect(body.name).toBe("TJ");
    expect(body.email).toBe("tj@x.com");
    expect(body.role).toBe("SALES_MANAGER");
    expect(body.state).toBe("TX");
    expect(body.manager).toEqual({ managesType: "REP_MANAGER", company: "Acme" });
    expect(body.teamSize).toBe(2);
    expect(body.teamStats.ratingsLast90d).toBe(2);
    expect(body.teamStats.avgOverall).toBe(4);
  });

  it("returns the RATER_MANAGER shape with ratings-given count last 90d", async () => {
    state.users["mgr-2"] = {
      id: "mgr-2",
      email: "rm@x.com",
      name: "Rater Mgr",
      role: "RATER_MANAGER",
      state: "TX",
      avatarUrl: null,
      createdAt: new Date("2026-01-01"),
      managerProfile: { managesType: "RATER_MANAGER", company: "Globex" },
    };
    state.memberships = [
      {
        id: "tm-r-1",
        managerId: "mgr-2",
        memberId: "rater-1",
        acceptedAt: new Date("2026-02-01"),
        endedAt: null,
      },
      {
        id: "tm-r-2",
        managerId: "mgr-2",
        memberId: "rater-2",
        acceptedAt: new Date("2026-02-01"),
        endedAt: null,
      },
    ];
    state.ratings = [
      {
        repUserId: "any-rep",
        raterUserId: "rater-1",
        responsiveness: 4,
        productKnowledge: 4,
        followThrough: 4,
        listeningNeedsFit: 4,
        trustIntegrity: 4,
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      },
      {
        repUserId: "any-rep",
        raterUserId: "rater-2",
        responsiveness: 4,
        productKnowledge: 4,
        followThrough: 4,
        listeningNeedsFit: 4,
        trustIntegrity: 4,
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
      // Old — excluded
      {
        repUserId: "any-rep",
        raterUserId: "rater-1",
        responsiveness: 4,
        productKnowledge: 4,
        followThrough: 4,
        listeningNeedsFit: 4,
        trustIntegrity: 4,
        createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
      },
      // Different rater — excluded
      {
        repUserId: "any-rep",
        raterUserId: "rater-other",
        responsiveness: 4,
        productKnowledge: 4,
        followThrough: 4,
        listeningNeedsFit: 4,
        trustIntegrity: 4,
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      },
    ];

    const res = await callRoute("mgr-2");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("RATER_MANAGER");
    expect(body.manager.managesType).toBe("RATER_MANAGER");
    expect(body.teamSize).toBe(2);
    expect(body.teamStats.avgOverall).toBeNull();
    expect(body.teamStats.ratingsLast90d).toBe(2);
  });
});
