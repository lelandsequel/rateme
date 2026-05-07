/**
 * Tests for GET /api/team/connections.
 *
 * SALES_MANAGER → raters connected to my reps (redacted via publicRater).
 * RATER_MANAGER → reps connected to my raters.
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
  requireRole: vi.fn(async (...allowed: string[]) => {
    if (!mockSession) throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    if (!allowed.includes(mockSession.user.role)) {
      throw new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    }
    return mockSession;
  }),
}));

interface MembershipRow {
  managerId: string;
  memberId: string;
  acceptedAt: Date | null;
  endedAt: Date | null;
}
interface ConnRow {
  id: string;
  repUserId: string;
  raterUserId: string;
  status: string;
}
const memberships: { rows: MembershipRow[] } = { rows: [] };
const conns: { rows: ConnRow[] } = { rows: [] };

const repUsers: Record<
  string,
  {
    id: string;
    name: string;
    repProfile: {
      title: string;
      company: string;
      industry: { slug: string; name: string };
    } | null;
  }
> = {};
const raterUsers: Record<
  string,
  {
    id: string;
    name: string;
    email: string;
    state: string;
    createdAt: Date;
    raterProfile: {
      title: string;
      company: string;
      industry: { slug: string; name: string };
    } | null;
  }
> = {};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    teamMembership: {
      findMany: vi.fn(
        async (args: {
          where: {
            managerId?: string;
            endedAt?: null;
            acceptedAt?: { not: null };
          };
        }) => {
          return memberships.rows
            .filter((r) => {
              if (args.where.managerId && r.managerId !== args.where.managerId) return false;
              if (args.where.endedAt === null && r.endedAt !== null) return false;
              if (args.where.acceptedAt?.not === null && r.acceptedAt === null) return false;
              return true;
            })
            .map((r) => ({ memberId: r.memberId }));
        },
      ),
    },
    connection: {
      findMany: vi.fn(
        async (args: {
          where: {
            status: string;
            repUserId?: { in: string[] };
            raterUserId?: { in: string[] };
          };
        }) => {
          return conns.rows
            .filter((c) => {
              if (c.status !== args.where.status) return false;
              if (args.where.repUserId && !args.where.repUserId.in.includes(c.repUserId))
                return false;
              if (args.where.raterUserId && !args.where.raterUserId.in.includes(c.raterUserId))
                return false;
              return true;
            })
            .map((c) => ({
              ...c,
              rep: repUsers[c.repUserId],
              rater: raterUsers[c.raterUserId],
            }));
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
  conns.rows = [];
  for (const k of Object.keys(repUsers)) delete repUsers[k];
  for (const k of Object.keys(raterUsers)) delete raterUsers[k];
});

describe("GET /api/team/connections", () => {
  it("returns 403 when caller is REP", async () => {
    mockSession = { user: { id: "rep-1", email: "r@x.com", name: "R", role: "REP" } };
    const res = await callRoute();
    expect(res.status).toBe(403);
  });

  it("returns empty raters when manager has no team", async () => {
    const res = await callRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.raters).toEqual([]);
  });

  it("aggregates raters per sales manager, dedup-by-rater", async () => {
    memberships.rows.push(
      { managerId: "mgr-1", memberId: "rep-1", acceptedAt: new Date(), endedAt: null },
      { managerId: "mgr-1", memberId: "rep-2", acceptedAt: new Date(), endedAt: null },
    );
    repUsers["rep-1"] = { id: "rep-1", name: "Rep One", repProfile: null };
    repUsers["rep-2"] = { id: "rep-2", name: "Rep Two", repProfile: null };
    raterUsers["rater-1"] = {
      id: "rater-1",
      name: "Anna",
      email: "anna@x.com",
      state: "TX",
      createdAt: new Date(),
      raterProfile: {
        title: "VP Procurement",
        company: "Globex",
        industry: { slug: "saas", name: "SaaS" },
      },
    };
    conns.rows.push(
      { id: "c1", repUserId: "rep-1", raterUserId: "rater-1", status: "ACCEPTED" },
      { id: "c2", repUserId: "rep-2", raterUserId: "rater-1", status: "ACCEPTED" },
    );
    const res = await callRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.raters.length).toBe(1);
    const r = body.raters[0];
    expect(r.title).toBe("VP Procurement");
    expect(r.company).toBe("Globex");
    // PRIVACY: redacted, NO name/email leak.
    expect(r.name).toBeUndefined();
    expect(r.email).toBeUndefined();
    expect(r.connectedToReps.map((x: { repId: string }) => x.repId).sort()).toEqual([
      "rep-1",
      "rep-2",
    ]);
  });

  it("excludes pending memberships from the team set", async () => {
    memberships.rows.push({
      managerId: "mgr-1",
      memberId: "rep-1",
      acceptedAt: null,
      endedAt: null,
    });
    repUsers["rep-1"] = { id: "rep-1", name: "Rep One", repProfile: null };
    raterUsers["rater-1"] = {
      id: "rater-1",
      name: "A",
      email: "a@x.com",
      state: "TX",
      createdAt: new Date(),
      raterProfile: {
        title: "T",
        company: "C",
        industry: { slug: "s", name: "S" },
      },
    };
    conns.rows.push({
      id: "c1",
      repUserId: "rep-1",
      raterUserId: "rater-1",
      status: "ACCEPTED",
    });
    const res = await callRoute();
    const body = await res.json();
    expect(body.raters).toEqual([]);
  });

  it("RATER_MANAGER returns reps with full info (no rater redaction needed)", async () => {
    mockSession = { user: { id: "mgr-r", email: "rm@x.com", name: "RM", role: "RATER_MANAGER" } };
    memberships.rows.push({
      managerId: "mgr-r",
      memberId: "rater-1",
      acceptedAt: new Date(),
      endedAt: null,
    });
    repUsers["rep-1"] = {
      id: "rep-1",
      name: "Rep One",
      repProfile: {
        title: "AE",
        company: "Acme",
        industry: { slug: "saas", name: "SaaS" },
      },
    };
    raterUsers["rater-1"] = {
      id: "rater-1",
      name: "A",
      email: "a@x.com",
      state: "TX",
      createdAt: new Date(),
      raterProfile: {
        title: "VP",
        company: "Globex",
        industry: { slug: "saas", name: "SaaS" },
      },
    };
    conns.rows.push({
      id: "c1",
      repUserId: "rep-1",
      raterUserId: "rater-1",
      status: "ACCEPTED",
    });
    const res = await callRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reps.length).toBe(1);
    expect(body.reps[0].name).toBe("Rep One");
    expect(body.reps[0].title).toBe("AE");
    expect(body.reps[0].connectedToRaters[0].raterTitle).toBe("VP");
    expect(body.reps[0].connectedToRaters[0].raterCompany).toBe("Globex");
  });
});
