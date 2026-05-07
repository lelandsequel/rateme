/**
 * Tests for GET /api/me/export — confirms shape, content-disposition,
 * and the privacy redaction on ratingsReceived (rater identity stripped).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Auth mock
// ---------------------------------------------------------------------------

let mockSession:
  | { user: { id: string; email: string; name: string; role: string } }
  | null = {
  user: { id: "rep-1", email: "rep@x.com", name: "Rep", role: "REP" },
};

vi.mock("@/lib/auth", () => ({
  requireSession: vi.fn(async () => {
    if (!mockSession) {
      throw new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    return mockSession;
  }),
}));

// ---------------------------------------------------------------------------
// Prisma mock — tailored to the rep-as-caller scenario.
// ---------------------------------------------------------------------------

const fixtures = {
  user: null as unknown as {
    id: string;
    name: string;
    email: string;
    role: string;
    state: string;
    avatarUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
    lastLoginAt: Date | null;
    emailVerifiedAt: Date | null;
    repProfile: {
      title: string;
      company: string;
      metroArea: string | null;
      industry: { slug: string; name: string };
    } | null;
    raterProfile: null;
    managerProfile: null;
  },
  connections: [] as Array<unknown>,
  ratingsGiven: [] as Array<unknown>,
  ratingsReceived: [] as Array<unknown>,
  reqInitiated: [] as Array<unknown>,
  reqTarget: [] as Array<unknown>,
  favs: [] as Array<unknown>,
  managed: [] as Array<unknown>,
  membershipMember: null as unknown,
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => fixtures.user),
    },
    connection: {
      findMany: vi.fn(async () => fixtures.connections),
    },
    rating: {
      findMany: vi.fn(async (args: { where: { repUserId?: string; raterUserId?: string } }) => {
        if (args.where.raterUserId) return fixtures.ratingsGiven;
        if (args.where.repUserId) return fixtures.ratingsReceived;
        return [];
      }),
    },
    ratingRequest: {
      findMany: vi.fn(async (args: { where: { initiatedByUserId?: string; forRepUserId?: string } }) => {
        if (args.where.initiatedByUserId) return fixtures.reqInitiated;
        if (args.where.forRepUserId) return fixtures.reqTarget;
        return [];
      }),
    },
    favorite: {
      findMany: vi.fn(async () => fixtures.favs),
    },
    teamMembership: {
      findMany: vi.fn(async () => fixtures.managed),
      findFirst: vi.fn(async () => fixtures.membershipMember),
    },
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function callGet(): Promise<Response> {
  const mod = await import("./route");
  return mod.GET();
}

beforeEach(() => {
  mockSession = {
    user: { id: "rep-1", email: "rep@x.com", name: "Rep", role: "REP" },
  };
  fixtures.user = {
    id: "rep-1",
    name: "Rep One",
    email: "rep@x.com",
    role: "REP",
    state: "TX",
    avatarUrl: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-04-01"),
    lastLoginAt: new Date("2026-04-20"),
    emailVerifiedAt: new Date("2026-01-02"),
    repProfile: {
      title: "AE",
      company: "Acme",
      metroArea: "Houston, TX",
      industry: { slug: "saas", name: "SaaS" },
    },
    raterProfile: null,
    managerProfile: null,
  };
  fixtures.connections = [];
  fixtures.ratingsGiven = [];
  fixtures.ratingsReceived = [
    {
      id: "rat-1",
      connectionId: "conn-1",
      responsiveness: 5,
      productKnowledge: 4,
      followThrough: 5,
      listeningNeedsFit: 4,
      trustIntegrity: 5,
      takeCallAgain: true,
      createdAt: new Date("2026-04-10"),
      rater: {
        id: "rater-secret",
        name: "Bulma Briefs",
        email: "bulma@private.com",
        state: "TX",
        createdAt: new Date("2026-01-01"),
        raterProfile: {
          title: "VP Procurement",
          company: "BigCo",
          industry: { slug: "saas", name: "SaaS" },
        },
      },
    },
  ];
  fixtures.reqInitiated = [];
  fixtures.reqTarget = [];
  fixtures.favs = [];
  fixtures.managed = [];
  fixtures.membershipMember = null;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/me/export", () => {
  it("returns 401 when there is no session", async () => {
    mockSession = null;
    const res = await callGet();
    expect(res.status).toBe(401);
  });

  it("returns 200 with attachment Content-Disposition", async () => {
    const res = await callGet();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const cd = res.headers.get("Content-Disposition") ?? "";
    expect(cd).toContain("attachment");
    expect(cd).toContain("rmr-export-rep-1-");
    expect(cd).toContain(".json");
  });

  it("includes the documented top-level keys", async () => {
    const res = await callGet();
    const body = await res.json();
    expect(body).toHaveProperty("exportedAt");
    expect(body).toHaveProperty("user");
    expect(body).toHaveProperty("profile");
    expect(body).toHaveProperty("connections");
    expect(body).toHaveProperty("ratingsGiven");
    expect(body).toHaveProperty("ratingsReceived");
    expect(body).toHaveProperty("ratingRequestsInitiated");
    expect(body).toHaveProperty("ratingRequestsAsTarget");
    expect(body).toHaveProperty("favoritesAsRater");
    expect(body).toHaveProperty("managedMemberships");
    expect(body).toHaveProperty("membershipAsMember");
  });

  it("includes rater name in ratingsReceived but never leaks email", async () => {
    const res = await callGet();
    const body = await res.json();
    expect(body.ratingsReceived).toHaveLength(1);
    const rated = body.ratingsReceived[0];
    expect(rated.rater).toBeDefined();
    // Name is now visible (per 2026-04-29 spec change). Email is still hidden.
    expect(typeof rated.rater.name).toBe("string");
    expect(rated.rater.email).toBeUndefined();
    // PublicRater shape: name + title + company + industry + state + userId.
    expect(rated.rater.title).toBe("VP Procurement");
    expect(rated.rater.company).toBe("BigCo");
    expect(rated.rater.industry.name).toBe("SaaS");
    expect(rated.rater.userId).toBe("rater-secret");
  });

  it("includes self-info on the user block", async () => {
    const res = await callGet();
    const body = await res.json();
    expect(body.user.id).toBe("rep-1");
    expect(body.user.email).toBe("rep@x.com");
    expect(body.user.name).toBe("Rep One");
    expect(body.profile.rep.title).toBe("AE");
    expect(body.profile.rep.company).toBe("Acme");
  });

  it("returns 404 when the user row is missing", async () => {
    fixtures.user = null as unknown as typeof fixtures.user;
    const res = await callGet();
    expect(res.status).toBe(404);
  });
});
