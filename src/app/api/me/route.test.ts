/**
 * Tests for /api/me PATCH (profile edit).
 *
 * Mocks: @/lib/auth, @/lib/prisma, @/lib/env. Per-role updates are
 * dispatched against in-memory rep / rater / manager profile rows. The
 * $transaction is mocked as "run the callback with the same prisma".
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const envState = { HAS_DB: true };
vi.mock("@/lib/env", () => ({
  get HAS_DB() {
    return envState.HAS_DB;
  },
}));

let mockSession:
  | { user: { id: string; email: string; name: string; role: string } }
  | null = {
  user: { id: "user-1", email: "u@x.com", name: "U", role: "REP" },
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

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  state: string;
  avatarUrl: string | null;
  createdAt: Date;
  repProfile?: {
    title: string;
    company: string;
    metroArea: string | null;
    industry: { slug: string; name: string };
    industryId: string;
  } | null;
  raterProfile?: {
    title: string;
    company: string;
    industry: { slug: string; name: string };
    industryId: string;
  } | null;
  managerProfile?: {
    managesType: string;
    company: string;
  } | null;
}

const users: Record<string, UserRow> = {};
const industries: Array<{ id: string; slug: string; name: string }> = [
  { id: "ind-saas", slug: "saas", name: "SaaS / Software" },
  { id: "ind-mfg", slug: "manufacturing", name: "Manufacturing" },
];

vi.mock("@/lib/prisma", () => {
  const prisma = {
    user: {
      findUnique: vi.fn(async (args: { where: { id: string } }) => {
        return users[args.where.id] ?? null;
      }),
      update: vi.fn(
        async (args: {
          where: { id: string };
          data: { name?: string; state?: string };
        }) => {
          const u = users[args.where.id];
          if (!u) throw new Error("not found");
          if (args.data.name !== undefined) u.name = args.data.name;
          if (args.data.state !== undefined) u.state = args.data.state;
          return u;
        },
      ),
    },
    repProfile: {
      update: vi.fn(
        async (args: {
          where: { userId: string };
          data: {
            title?: string;
            company?: string;
            metroArea?: string | null;
            industry?: { connect: { id: string } };
          };
        }) => {
          const u = users[args.where.userId];
          if (!u?.repProfile) throw new Error("no repProfile");
          if (args.data.title !== undefined) u.repProfile.title = args.data.title;
          if (args.data.company !== undefined) u.repProfile.company = args.data.company;
          if (args.data.metroArea !== undefined) u.repProfile.metroArea = args.data.metroArea;
          if (args.data.industry?.connect?.id) {
            const ind = industries.find((i) => i.id === args.data.industry!.connect.id);
            if (ind) {
              u.repProfile.industryId = ind.id;
              u.repProfile.industry = { slug: ind.slug, name: ind.name };
            }
          }
          return u.repProfile;
        },
      ),
    },
    raterProfile: {
      update: vi.fn(
        async (args: {
          where: { userId: string };
          data: {
            title?: string;
            company?: string;
            industry?: { connect: { id: string } };
          };
        }) => {
          const u = users[args.where.userId];
          if (!u?.raterProfile) throw new Error("no raterProfile");
          if (args.data.title !== undefined) u.raterProfile.title = args.data.title;
          if (args.data.company !== undefined) u.raterProfile.company = args.data.company;
          if (args.data.industry?.connect?.id) {
            const ind = industries.find((i) => i.id === args.data.industry!.connect.id);
            if (ind) {
              u.raterProfile.industryId = ind.id;
              u.raterProfile.industry = { slug: ind.slug, name: ind.name };
            }
          }
          return u.raterProfile;
        },
      ),
    },
    managerProfile: {
      update: vi.fn(
        async (args: { where: { userId: string }; data: { company?: string } }) => {
          const u = users[args.where.userId];
          if (!u?.managerProfile) throw new Error("no managerProfile");
          if (args.data.company !== undefined) u.managerProfile.company = args.data.company;
          return u.managerProfile;
        },
      ),
    },
    industry: {
      findUnique: vi.fn(async (args: { where: { slug: string } }) => {
        return industries.find((i) => i.slug === args.where.slug) ?? null;
      }),
    },
    $transaction: vi.fn(
      async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    ),
  };
  return { prisma };
});

async function callPatch(body: unknown): Promise<Response> {
  const mod = await import("./route");
  const req = new Request("http://localhost/api/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return mod.PATCH(req);
}

beforeEach(() => {
  envState.HAS_DB = true;
  for (const k of Object.keys(users)) delete users[k];
  users["user-1"] = {
    id: "user-1",
    email: "u@x.com",
    name: "Original Name",
    role: "REP",
    state: "TX",
    avatarUrl: null,
    createdAt: new Date("2026-01-01"),
    repProfile: {
      title: "AE",
      company: "OldCo",
      metroArea: "Houston, TX",
      industry: { slug: "saas", name: "SaaS / Software" },
      industryId: "ind-saas",
    },
    raterProfile: null,
    managerProfile: null,
  };
  mockSession = { user: { id: "user-1", email: "u@x.com", name: "U", role: "REP" } };
});

describe("PATCH /api/me", () => {
  it("returns 401 when not authenticated", async () => {
    mockSession = null;
    const res = await callPatch({ name: "X" });
    expect(res.status).toBe(401);
  });

  it("returns 503 in mock mode", async () => {
    envState.HAS_DB = false;
    const res = await callPatch({ name: "X" });
    expect(res.status).toBe(503);
  });

  it("returns 400 for invalid JSON body", async () => {
    const mod = await import("./route");
    const req = new Request("http://localhost/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    const res = await mod.PATCH(req);
    expect(res.status).toBe(400);
  });

  it("rejects empty name", async () => {
    const res = await callPatch({ name: "" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/name/i);
  });

  it("rejects too-long name", async () => {
    const res = await callPatch({ name: "x".repeat(101) });
    expect(res.status).toBe(400);
  });

  it("rejects invalid state code", async () => {
    const res = await callPatch({ state: "ZZ" });
    expect(res.status).toBe(400);
  });

  it("rejects unknown industrySlug", async () => {
    const res = await callPatch({ industrySlug: "non-existent" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/industrySlug/);
  });

  it("rejects too-long company", async () => {
    const res = await callPatch({ company: "x".repeat(101) });
    expect(res.status).toBe(400);
  });

  it("rejects too-long metroArea", async () => {
    const res = await callPatch({ metroArea: "x".repeat(101) });
    expect(res.status).toBe(400);
  });

  it("updates user-level fields (name + state)", async () => {
    const res = await callPatch({ name: "New Name", state: "CA" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("New Name");
    expect(body.state).toBe("CA");
  });

  it("updates rep-specific fields and resolves industrySlug", async () => {
    const res = await callPatch({
      title: "Senior AE",
      company: "NewCo",
      industrySlug: "manufacturing",
      metroArea: "Austin, TX",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.repProfile.title).toBe("Senior AE");
    expect(body.repProfile.company).toBe("NewCo");
    expect(body.repProfile.industry.slug).toBe("manufacturing");
    expect(body.repProfile.metroArea).toBe("Austin, TX");
  });

  it("clears metroArea when null is passed", async () => {
    const res = await callPatch({ metroArea: null });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.repProfile.metroArea).toBeNull();
  });

  it("clears metroArea when empty string is passed", async () => {
    const res = await callPatch({ metroArea: "" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.repProfile.metroArea).toBeNull();
  });

  it("ignores rep-only fields for a RATER user", async () => {
    users["user-1"]!.role = "RATER";
    users["user-1"]!.repProfile = null;
    users["user-1"]!.raterProfile = {
      title: "Buyer",
      company: "OldCo",
      industry: { slug: "saas", name: "SaaS / Software" },
      industryId: "ind-saas",
    };
    mockSession = { user: { id: "user-1", email: "u@x.com", name: "U", role: "RATER" } };

    const res = await callPatch({
      title: "VP of Procurement",
      metroArea: "Should be ignored",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.raterProfile.title).toBe("VP of Procurement");
    // metroArea is REP-only — RATER profile has no such field.
    expect(body.raterProfile.metroArea).toBeUndefined();
  });

  it("updates manager company for SALES_MANAGER", async () => {
    users["user-1"]!.role = "SALES_MANAGER";
    users["user-1"]!.repProfile = null;
    users["user-1"]!.managerProfile = {
      managesType: "REP_MANAGER",
      company: "OldCo",
    };
    mockSession = {
      user: { id: "user-1", email: "u@x.com", name: "U", role: "SALES_MANAGER" },
    };

    const res = await callPatch({ company: "NewCo Sales" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.managerProfile.company).toBe("NewCo Sales");
  });

  it("trims whitespace on string fields", async () => {
    const res = await callPatch({ name: "  Padded Name  " });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Padded Name");
  });

  it("handles a no-op patch gracefully", async () => {
    const res = await callPatch({});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Original Name");
  });
});
