/**
 * Tests for POST /api/team/invite.
 *
 * Same lightweight mocking posture as notifications/register: vi.mock for
 * @/lib/auth + @/lib/prisma, hand-rolled in-memory tables.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

process.env.AUTH_SECRET = "test-auth-secret-do-not-use-in-prod";

let mockSession: { user: { id: string; email: string; name: string; role: string } } | null = {
  user: { id: "mgr-1", email: "mgr@x.com", name: "Mgr", role: "SALES_MANAGER" },
};

vi.mock("@/lib/auth", () => ({
  requireSession: vi.fn(async () => {
    if (!mockSession) {
      throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    return mockSession;
  }),
  requireRole: vi.fn(async (...allowed: string[]) => {
    if (!mockSession) {
      throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    if (!allowed.includes(mockSession.user.role)) {
      throw new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    }
    return mockSession;
  }),
}));

type UserRow = { id: string; email: string; role: string };
type MembershipRow = {
  id: string;
  managerId: string;
  memberId: string;
  invitedAt: Date;
  acceptedAt: Date | null;
  endedAt: Date | null;
};

const userTable: { rows: UserRow[] } = { rows: [] };
const membershipTable: { rows: MembershipRow[]; nextId: number } = {
  rows: [],
  nextId: 1,
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(async (args: { where: { email: { in: string[] } }; select: unknown }) => {
        return userTable.rows
          .filter((u) => args.where.email.in.includes(u.email))
          .map((u) => ({ id: u.id, email: u.email, role: u.role }));
      }),
    },
    teamMembership: {
      findMany: vi.fn(
        async (args: {
          where: {
            managerId?: string;
            memberId?: { in: string[] };
            endedAt?: null;
            NOT?: { managerId: string };
          };
        }) => {
          return membershipTable.rows.filter((r) => {
            if (args.where.managerId && r.managerId !== args.where.managerId) return false;
            if (args.where.memberId && !args.where.memberId.in.includes(r.memberId)) return false;
            if (args.where.endedAt === null && r.endedAt !== null) return false;
            if (args.where.NOT?.managerId && r.managerId === args.where.NOT.managerId) return false;
            return true;
          });
        },
      ),
      create: vi.fn(
        async (args: {
          data: { managerId: string; memberId: string };
        }) => {
          const row: MembershipRow = {
            id: `tm-${membershipTable.nextId++}`,
            managerId: args.data.managerId,
            memberId: args.data.memberId,
            invitedAt: new Date(),
            acceptedAt: null,
            endedAt: null,
          };
          membershipTable.rows.push(row);
          return row;
        },
      ),
      update: vi.fn(
        async (args: {
          where: { memberId: string };
          data: Partial<MembershipRow>;
        }) => {
          const r = membershipTable.rows.find((m) => m.memberId === args.where.memberId);
          if (!r) throw new Error("not found");
          Object.assign(r, args.data);
          return r;
        },
      ),
    },
  },
}));

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/team/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function callRoute(body: unknown): Promise<Response> {
  const mod = await import("./route");
  return mod.POST(makeRequest(body));
}

beforeEach(() => {
  mockSession = { user: { id: "mgr-1", email: "mgr@x.com", name: "Mgr", role: "SALES_MANAGER" } };
  userTable.rows = [
    { id: "rep-1", email: "rep1@x.com", role: "REP" },
    { id: "rep-2", email: "rep2@x.com", role: "REP" },
    { id: "rater-1", email: "rater1@x.com", role: "RATER" },
  ];
  membershipTable.rows = [];
  membershipTable.nextId = 1;
});

describe("POST /api/team/invite", () => {
  it("returns 401 when there is no session", async () => {
    mockSession = null;
    const res = await callRoute({ memberEmails: ["rep1@x.com"] });
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is a REP", async () => {
    mockSession = { user: { id: "rep-1", email: "rep1@x.com", name: "R", role: "REP" } };
    const res = await callRoute({ memberEmails: ["rep2@x.com"] });
    expect(res.status).toBe(403);
  });

  it("returns 400 when memberEmails is missing", async () => {
    const res = await callRoute({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when memberEmails is empty", async () => {
    const res = await callRoute({ memberEmails: [] });
    expect(res.status).toBe(400);
  });

  it("returns 400 when memberEmails exceeds 50", async () => {
    const emails = Array.from({ length: 51 }, (_, i) => `r${i}@x.com`);
    const res = await callRoute({ memberEmails: emails });
    expect(res.status).toBe(400);
  });

  it("returns 400 when memberEmails contains a non-string", async () => {
    const res = await callRoute({ memberEmails: ["rep1@x.com", 42] });
    expect(res.status).toBe(400);
  });

  it("creates a TeamMembership for a valid REP target (sales manager)", async () => {
    const res = await callRoute({ memberEmails: ["rep1@x.com"] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toEqual([{ memberId: "rep-1", email: "rep1@x.com" }]);
    expect(body.skipped).toEqual([]);
    expect(membershipTable.rows.length).toBe(1);
    expect(membershipTable.rows[0].managerId).toBe("mgr-1");
    expect(membershipTable.rows[0].acceptedAt).toBeNull();
  });

  it("skips RATERs when caller is SALES_MANAGER", async () => {
    const res = await callRoute({ memberEmails: ["rater1@x.com"] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toEqual([]);
    expect(body.skipped[0].reason).toMatch(/RATER/);
  });

  it("skips emails that don't map to a user", async () => {
    const res = await callRoute({ memberEmails: ["nobody@x.com"] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped[0].reason).toMatch(/no user/);
  });

  it("skips a target already on this manager's team", async () => {
    membershipTable.rows.push({
      id: "tm-pre",
      managerId: "mgr-1",
      memberId: "rep-1",
      invitedAt: new Date(),
      acceptedAt: null,
      endedAt: null,
    });
    const res = await callRoute({ memberEmails: ["rep1@x.com"] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toEqual([]);
    expect(body.skipped[0].reason).toMatch(/already on your team/);
  });

  it("skips a target on ANOTHER manager's active team", async () => {
    membershipTable.rows.push({
      id: "tm-other",
      managerId: "mgr-other",
      memberId: "rep-1",
      invitedAt: new Date(),
      acceptedAt: new Date(),
      endedAt: null,
    });
    const res = await callRoute({ memberEmails: ["rep1@x.com"] });
    const body = await res.json();
    expect(body.created).toEqual([]);
    expect(body.skipped[0].reason).toMatch(/another manager/);
  });

  it("dedupes emails in the input", async () => {
    const res = await callRoute({
      memberEmails: ["rep1@x.com", "REP1@x.com", "rep1@x.com"],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created.length).toBe(1);
  });

  it("RATER_MANAGER may invite raters but not reps", async () => {
    mockSession = {
      user: { id: "mgr-r", email: "rmgr@x.com", name: "RM", role: "RATER_MANAGER" },
    };
    const res = await callRoute({ memberEmails: ["rater1@x.com", "rep1@x.com"] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created.map((c: { email: string }) => c.email)).toEqual(["rater1@x.com"]);
    expect(body.skipped[0].email).toBe("rep1@x.com");
  });

  it("re-uses an ended membership row by updating it", async () => {
    membershipTable.rows.push({
      id: "tm-stale",
      managerId: "mgr-old",
      memberId: "rep-1",
      invitedAt: new Date("2026-01-01"),
      acceptedAt: new Date("2026-01-02"),
      endedAt: new Date("2026-02-01"),
    });
    const res = await callRoute({ memberEmails: ["rep1@x.com"] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created.length).toBe(1);
    const row = membershipTable.rows.find((r) => r.memberId === "rep-1")!;
    expect(row.managerId).toBe("mgr-1");
    expect(row.acceptedAt).toBeNull();
    expect(row.endedAt).toBeNull();
  });
});
