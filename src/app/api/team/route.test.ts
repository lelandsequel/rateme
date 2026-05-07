/**
 * Tests for GET /api/team.
 *
 * The route shape diverges based on caller role:
 *   manager → members[]
 *   non-manager → memberships[]
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

process.env.AUTH_SECRET = "test-auth-secret-do-not-use-in-prod";

let mockSession: { user: { id: string; email: string; name: string; role: string } } | null = {
  user: { id: "mgr-1", email: "mgr@x.com", name: "Mgr", role: "SALES_MANAGER" },
};

vi.mock("@/lib/auth", () => ({
  requireSession: vi.fn(async () => {
    if (!mockSession) throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    return mockSession;
  }),
  requireRole: vi.fn(async () => {
    throw new Error("not used");
  }),
}));

interface MembershipRow {
  id: string;
  managerId: string;
  memberId: string;
  invitedAt: Date;
  acceptedAt: Date | null;
  endedAt: Date | null;
}

const memberships: { rows: MembershipRow[] } = { rows: [] };

const userById: Record<
  string,
  {
    id: string;
    name: string;
    email: string;
    role: string;
    state: string;
    repProfile?: {
      title: string;
      company: string;
      industry: { slug: string; name: string };
      metroArea: string | null;
      bio: string | null;
    } | null;
    raterProfile?: {
      title: string;
      company: string;
      industry: { slug: string; name: string };
    } | null;
    managerProfile?: {
      userId: string;
      managesType: string;
      company: string;
    } | null;
    _count: { ratingsReceived: number };
  }
> = {};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    teamMembership: {
      findMany: vi.fn(
        async (args: {
          where: { managerId?: string; memberId?: string; endedAt?: null };
          include?: unknown;
        }) => {
          return memberships.rows
            .filter((r) => {
              if (args.where.managerId && r.managerId !== args.where.managerId) return false;
              if (args.where.memberId && r.memberId !== args.where.memberId) return false;
              if (args.where.endedAt === null && r.endedAt !== null) return false;
              return true;
            })
            .map((r) => {
              if (args.where.managerId) {
                return { ...r, member: userById[r.memberId] };
              }
              return { ...r, manager: userById[r.managerId] };
            });
        },
      ),
    },
  },
}));

async function callRoute(): Promise<Response> {
  const mod = await import("./route");
  return mod.GET();
}

beforeEach(() => {
  mockSession = { user: { id: "mgr-1", email: "mgr@x.com", name: "Mgr", role: "SALES_MANAGER" } };
  memberships.rows = [];
  for (const k of Object.keys(userById)) delete userById[k];
});

describe("GET /api/team", () => {
  it("returns 401 when there is no session", async () => {
    mockSession = null;
    const res = await callRoute();
    expect(res.status).toBe(401);
  });

  it("returns manager view with members for SALES_MANAGER", async () => {
    userById["rep-1"] = {
      id: "rep-1",
      name: "Rep One",
      email: "rep1@x.com",
      role: "REP",
      state: "TX",
      repProfile: {
        title: "AE",
        company: "Acme",
        industry: { slug: "saas", name: "SaaS" },
        metroArea: "Houston, TX",
        bio: null,
      },
      raterProfile: null,
      _count: { ratingsReceived: 7 },
    };
    memberships.rows.push({
      id: "tm-1",
      managerId: "mgr-1",
      memberId: "rep-1",
      invitedAt: new Date("2026-04-01"),
      acceptedAt: new Date("2026-04-02"),
      endedAt: null,
    });

    const res = await callRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("manager");
    expect(body.members.length).toBe(1);
    expect(body.members[0].status).toBe("active");
    expect(body.members[0].member.name).toBe("Rep One");
    expect(body.members[0].member.repProfile.recentRatingCount).toBe(7);
  });

  it("returns pending status for un-accepted memberships", async () => {
    userById["rep-2"] = {
      id: "rep-2",
      name: "Rep Two",
      email: "rep2@x.com",
      role: "REP",
      state: "TX",
      repProfile: {
        title: "AE",
        company: "Acme",
        industry: { slug: "saas", name: "SaaS" },
        metroArea: null,
        bio: null,
      },
      raterProfile: null,
      _count: { ratingsReceived: 0 },
    };
    memberships.rows.push({
      id: "tm-2",
      managerId: "mgr-1",
      memberId: "rep-2",
      invitedAt: new Date("2026-04-15"),
      acceptedAt: null,
      endedAt: null,
    });

    const res = await callRoute();
    const body = await res.json();
    expect(body.members[0].status).toBe("pending");
  });

  it("returns member view for REP caller with manager info", async () => {
    mockSession = { user: { id: "rep-1", email: "rep1@x.com", name: "R1", role: "REP" } };
    userById["mgr-1"] = {
      id: "mgr-1",
      name: "Mgr One",
      email: "mgr@x.com",
      role: "SALES_MANAGER",
      state: "TX",
      managerProfile: {
        userId: "mgr-1",
        managesType: "REP_MANAGER",
        company: "Acme",
      },
      _count: { ratingsReceived: 0 },
    };
    memberships.rows.push({
      id: "tm-3",
      managerId: "mgr-1",
      memberId: "rep-1",
      invitedAt: new Date("2026-04-01"),
      acceptedAt: null,
      endedAt: null,
    });

    const res = await callRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("member");
    expect(body.memberships.length).toBe(1);
    expect(body.memberships[0].status).toBe("pending");
    expect(body.memberships[0].manager.name).toBe("Mgr One");
    expect(body.memberships[0].manager.company).toBe("Acme");
    expect(body.memberships[0].manager.managesType).toBe("REP_MANAGER");
  });

  it("excludes ended memberships from the manager view", async () => {
    userById["rep-3"] = {
      id: "rep-3",
      name: "Rep Three",
      email: "rep3@x.com",
      role: "REP",
      state: "TX",
      repProfile: {
        title: "AE",
        company: "Acme",
        industry: { slug: "saas", name: "SaaS" },
        metroArea: null,
        bio: null,
      },
      raterProfile: null,
      _count: { ratingsReceived: 0 },
    };
    memberships.rows.push({
      id: "tm-end",
      managerId: "mgr-1",
      memberId: "rep-3",
      invitedAt: new Date("2026-01-01"),
      acceptedAt: new Date("2026-01-02"),
      endedAt: new Date("2026-02-01"),
    });
    const res = await callRoute();
    const body = await res.json();
    expect(body.members.length).toBe(0);
  });
});
