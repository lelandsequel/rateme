/**
 * Tests for POST /api/cron/weekly-highlights.
 *
 * - Asserts the auth header (and the Authorization Bearer fallback).
 * - Iterates a small set of mocked users and verifies the right
 *   per-role counts in the JSON summary.
 * - Mocks @/lib/email so we don't even touch stub-mode console noise.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Set the secret BEFORE importing the route module (route reads at call time
// so this also works set per-test, but locking it at the top is clearer).
process.env.RMR_CRON_SECRET = "test-secret";

const envState = { HAS_DB: true };
vi.mock("@/lib/env", () => ({
  get HAS_DB() {
    return envState.HAS_DB;
  },
}));

// Mocked sendEmail — captures every call so we can assert routing.
const sentEmails: Array<{ to: string; subject: string }> = [];
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async (msg: { to: string; subject: string }) => {
    sentEmails.push({ to: msg.to, subject: msg.subject });
    return { ok: true, provider: "stub" };
  }),
}));

// Hand-rolled prisma fake — covers exactly the surface the route exercises.
type UserRow = {
  id: string;
  email: string;
  name: string;
  role: "REP" | "RATER" | "SALES_MANAGER" | "RATER_MANAGER" | "ADMIN";
  avatarUrl: string | null;
};

type RatingRow = {
  id: string;
  repUserId: string;
  raterUserId: string;
  responsiveness: number;
  productKnowledge: number;
  followThrough: number;
  listeningNeedsFit: number;
  trustIntegrity: number;
  takeCallAgain: boolean;
  createdAt: Date;
};

type ConnectionRow = {
  repUserId: string;
  raterUserId: string;
};

type MembershipRow = {
  managerId: string;
  memberId: string;
  endedAt: Date | null;
};

const state: {
  users: UserRow[];
  ratings: RatingRow[];
  connections: ConnectionRow[];
  memberships: MembershipRow[];
  repProfiles: Record<string, { title: string; company: string } | undefined>;
  raterProfiles: Record<string, { title: string; company: string } | undefined>;
  managerProfiles: Record<
    string,
    { managesType: "REP_MANAGER" | "RATER_MANAGER"; company: string } | undefined
  >;
} = {
  users: [],
  ratings: [],
  connections: [],
  memberships: [],
  repProfiles: {},
  raterProfiles: {},
  managerProfiles: {},
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(
        async (args: {
          take: number;
          skip?: number;
          cursor?: { id: string };
          orderBy: unknown;
        }) => {
          const sorted = [...state.users].sort((a, b) => a.id.localeCompare(b.id));
          let start = 0;
          if (args.cursor) {
            const idx = sorted.findIndex((u) => u.id === args.cursor!.id);
            // Mirror prisma's cursor semantics with skip:1 → start AFTER cursor
            start = idx === -1 ? sorted.length : idx + (args.skip ?? 0);
          }
          return sorted.slice(start, start + args.take);
        },
      ),
    },
    rating: {
      count: vi.fn(async (args: { where: { repUserId: string } }) => {
        return state.ratings.filter((r) => r.repUserId === args.where.repUserId).length;
      }),
      findMany: vi.fn(
        async (args: {
          where: {
            repUserId?: string;
            raterUserId?: string;
            createdAt?: { gte?: Date; lt?: Date };
          };
          select?: unknown;
        }) => {
          return state.ratings.filter((r) => {
            if (args.where.repUserId && r.repUserId !== args.where.repUserId) return false;
            if (args.where.raterUserId && r.raterUserId !== args.where.raterUserId) return false;
            if (args.where.createdAt?.gte && r.createdAt < args.where.createdAt.gte) return false;
            if (args.where.createdAt?.lt && r.createdAt >= args.where.createdAt.lt) return false;
            return true;
          });
        },
      ),
    },
    connection: {
      count: vi.fn(async (args: { where: { raterUserId: string } }) => {
        return state.connections.filter(
          (c) => c.raterUserId === args.where.raterUserId,
        ).length;
      }),
    },
    teamMembership: {
      count: vi.fn(
        async (args: { where: { memberId: string; endedAt: null } }) => {
          return state.memberships.filter(
            (m) =>
              m.memberId === args.where.memberId && m.endedAt === null,
          ).length;
        },
      ),
      findMany: vi.fn(
        async (args: { where: { managerId: string; endedAt: null } }) => {
          const rows = state.memberships.filter(
            (m) =>
              m.managerId === args.where.managerId && m.endedAt === null,
          );
          return rows.map((m) => {
            const member = state.users.find((u) => u.id === m.memberId)!;
            return {
              member: {
                id: member.id,
                name: member.name,
                avatarUrl: member.avatarUrl,
              },
            };
          });
        },
      ),
    },
    repProfile: {
      findUnique: vi.fn(async (args: { where: { userId: string } }) => {
        return state.repProfiles[args.where.userId] ?? null;
      }),
    },
    raterProfile: {
      findUnique: vi.fn(async (args: { where: { userId: string } }) => {
        return state.raterProfiles[args.where.userId] ?? null;
      }),
    },
    managerProfile: {
      findUnique: vi.fn(async (args: { where: { userId: string } }) => {
        return state.managerProfiles[args.where.userId] ?? null;
      }),
    },
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function reset() {
  envState.HAS_DB = true;
  sentEmails.length = 0;
  state.users = [];
  state.ratings = [];
  state.connections = [];
  state.memberships = [];
  state.repProfiles = {};
  state.raterProfiles = {};
  state.managerProfiles = {};
}

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/cron/weekly-highlights", {
    method: "POST",
    headers,
  });
}

async function callRoute(req: Request): Promise<Response> {
  const mod = await import("./route");
  return mod.POST(req);
}

beforeEach(() => {
  reset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/cron/weekly-highlights", () => {
  it("returns 401 without the secret header", async () => {
    const res = await callRoute(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);
  });

  it("returns 401 when the secret is wrong", async () => {
    const res = await callRoute(makeRequest({ "x-rmr-cron-secret": "nope" }));
    expect(res.status).toBe(401);
  });

  it("accepts the Authorization: Bearer fallback", async () => {
    const res = await callRoute(
      makeRequest({ authorization: "Bearer test-secret" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(0);
  });

  it("returns 503 when HAS_DB is false (mock mode)", async () => {
    envState.HAS_DB = false;
    const res = await callRoute(
      makeRequest({ "x-rmr-cron-secret": "test-secret" }),
    );
    expect(res.status).toBe(503);
  });

  it("dispatches the right template per role and aggregates counters", async () => {
    // 1 rep with ratings, 1 rater with a connection, 1 sales manager with a team,
    // 1 rep with no activity (skipped), 1 admin (skipped).
    state.users = [
      { id: "u1", email: "rep1@x.com", name: "Rep One", role: "REP", avatarUrl: null },
      { id: "u2", email: "rater1@x.com", name: "Rater One", role: "RATER", avatarUrl: null },
      { id: "u3", email: "mgr1@x.com", name: "Mgr One", role: "SALES_MANAGER", avatarUrl: null },
      { id: "u4", email: "rep2@x.com", name: "Rep Two", role: "REP", avatarUrl: null },
      { id: "u5", email: "admin@x.com", name: "Admin", role: "ADMIN", avatarUrl: null },
    ];
    state.repProfiles["u1"] = { title: "AE", company: "Acme" };
    state.repProfiles["u4"] = { title: "AE", company: "Acme" };
    state.raterProfiles["u2"] = { title: "VP", company: "Big" };
    state.managerProfiles["u3"] = { managesType: "REP_MANAGER", company: "Acme" };

    state.ratings.push({
      id: "r1",
      repUserId: "u1",
      raterUserId: "u2",
      responsiveness: 5,
      productKnowledge: 5,
      followThrough: 5,
      listeningNeedsFit: 5,
      trustIntegrity: 5,
      takeCallAgain: true,
      createdAt: new Date(),
    });

    state.connections.push({ repUserId: "u1", raterUserId: "u2" });
    state.memberships.push({ managerId: "u3", memberId: "u1", endedAt: null });

    const res = await callRoute(
      makeRequest({ "x-rmr-cron-secret": "test-secret" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(5);
    expect(body.sent).toBe(3); // u1 (rep), u2 (rater), u3 (manager)
    expect(body.skipped).toBe(2); // u4 (rep no activity), u5 (admin)
    expect(body.failed).toBe(0);

    // Subjects per role
    const subjects = sentEmails.map((e) => e.subject);
    expect(subjects.some((s) => /Rep One/.test(s))).toBe(true);
    expect(subjects.some((s) => /Rater One/.test(s))).toBe(true);
    expect(subjects.some((s) => /Mgr One/.test(s) && /team/i.test(s))).toBe(true);
  });

  it("skips users with no email or no name", async () => {
    state.users = [
      // Empty email
      { id: "u1", email: "", name: "Rep", role: "REP", avatarUrl: null },
    ];
    const res = await callRoute(
      makeRequest({ "x-rmr-cron-secret": "test-secret" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.skipped).toBe(1);
    expect(body.sent).toBe(0);
    expect(sentEmails.length).toBe(0);
  });
});
