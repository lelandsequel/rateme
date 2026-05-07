/**
 * Tests for GET /api/admin/users.
 *
 * Covers the auth gate (non-admin → 403), substring search (q), role
 * filter, and pagination basics.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Auth mock — flips per test. requireRole rejects with 403 when role
// doesn't match.
// ---------------------------------------------------------------------------
let mockSession:
  | { user: { id: string; email: string; name: string; role: string } }
  | null = { user: { id: "admin-1", email: "a@a.com", name: "A", role: "ADMIN" } };

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

// ---------------------------------------------------------------------------
// Prisma mock — minimal fake user table that supports the surface the
// route uses (findMany with where/contains/role + count).
// ---------------------------------------------------------------------------

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  state: string;
  createdAt: Date;
  lastLoginAt: Date | null;
  emailVerifiedAt: Date | null;
}

const state: { users: UserRow[] } = { users: [] };

interface WhereClause {
  OR?: Array<{
    name?: { contains?: string; mode?: string };
    email?: { contains?: string; mode?: string };
  }>;
  role?: string;
}

function matchUser(u: UserRow, where: WhereClause | undefined): boolean {
  if (!where) return true;
  if (where.role && u.role !== where.role) return false;
  if (where.OR) {
    const ok = where.OR.some((c) => {
      if (c.name?.contains) {
        return u.name.toLowerCase().includes(c.name.contains.toLowerCase());
      }
      if (c.email?.contains) {
        return u.email.toLowerCase().includes(c.email.contains.toLowerCase());
      }
      return false;
    });
    if (!ok) return false;
  }
  return true;
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(
        async (args: {
          where?: WhereClause;
          take?: number;
          skip?: number;
          orderBy?: unknown;
          select?: unknown;
        }) => {
          const matched = state.users.filter((u) => matchUser(u, args.where));
          // Simulate orderBy createdAt desc.
          const sorted = [...matched].sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
          );
          const skip = args.skip ?? 0;
          const take = args.take ?? sorted.length;
          return sorted.slice(skip, skip + take);
        },
      ),
      count: vi.fn(async (args: { where?: WhereClause } = {}) => {
        return state.users.filter((u) => matchUser(u, args.where)).length;
      }),
    },
  },
}));

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function callGet(qs = ""): Promise<Response> {
  const mod = await import("./route");
  return mod.GET(new Request(`http://localhost/api/admin/users${qs}`));
}

beforeEach(() => {
  mockSession = {
    user: { id: "admin-1", email: "a@a.com", name: "A", role: "ADMIN" },
  };
  state.users = [
    {
      id: "u-1",
      name: "Alice Adams",
      email: "alice@acme.com",
      role: "REP",
      state: "TX",
      createdAt: new Date("2026-04-01"),
      lastLoginAt: new Date("2026-04-15"),
      emailVerifiedAt: new Date("2026-04-02"),
    },
    {
      id: "u-2",
      name: "Bob Brown",
      email: "bob@acme.com",
      role: "RATER",
      state: "CA",
      createdAt: new Date("2026-04-05"),
      lastLoginAt: null,
      emailVerifiedAt: null,
    },
    {
      id: "u-3",
      name: "Carol Cruz",
      email: "carol@globex.com",
      role: "REP",
      state: "NY",
      createdAt: new Date("2026-04-10"),
      lastLoginAt: new Date("2026-04-20"),
      emailVerifiedAt: new Date("2026-04-11"),
    },
    {
      id: "u-admin-1",
      name: "Admin",
      email: "a@a.com",
      role: "ADMIN",
      state: "DC",
      createdAt: new Date("2026-03-01"),
      lastLoginAt: new Date("2026-04-25"),
      emailVerifiedAt: new Date("2026-03-01"),
    },
  ];
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/admin/users", () => {
  it("returns 403 when caller is not ADMIN", async () => {
    mockSession = {
      user: { id: "u-1", email: "alice@acme.com", name: "Alice", role: "REP" },
    };
    const res = await callGet();
    expect(res.status).toBe(403);
  });

  it("returns 401 when there is no session", async () => {
    mockSession = null;
    const res = await callGet();
    expect(res.status).toBe(401);
  });

  it("returns the list of users (newest first) with total", async () => {
    const res = await callGet();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: UserRow[]; total: number };
    expect(body.total).toBe(4);
    expect(body.users).toHaveLength(4);
    // Newest first.
    expect(body.users[0].id).toBe("u-3");
    expect(body.users[3].id).toBe("u-admin-1");
  });

  it("applies the q substring filter against name + email", async () => {
    const res = await callGet("?q=acme");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: UserRow[]; total: number };
    // alice@acme.com + bob@acme.com
    expect(body.total).toBe(2);
    const ids = body.users.map((u) => u.id).sort();
    expect(ids).toEqual(["u-1", "u-2"]);
  });

  it("applies the role filter", async () => {
    const res = await callGet("?role=REP");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: UserRow[]; total: number };
    expect(body.total).toBe(2);
    expect(body.users.every((u) => u.role === "REP")).toBe(true);
  });

  it("combines q + role filters (AND)", async () => {
    const res = await callGet("?q=carol&role=REP");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: UserRow[]; total: number };
    expect(body.total).toBe(1);
    expect(body.users[0].id).toBe("u-3");
  });

  it("ignores an invalid role param (no filtering applied)", async () => {
    const res = await callGet("?role=NOT_A_ROLE");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: UserRow[]; total: number };
    expect(body.total).toBe(4);
  });

  it("respects limit + offset for pagination", async () => {
    const res = await callGet("?limit=2&offset=0");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: UserRow[]; total: number };
    expect(body.total).toBe(4); // total ignores pagination
    expect(body.users).toHaveLength(2);
    expect(body.users[0].id).toBe("u-3");

    const res2 = await callGet("?limit=2&offset=2");
    const body2 = (await res2.json()) as { users: UserRow[]; total: number };
    expect(body2.users).toHaveLength(2);
    expect(body2.users[0].id).toBe("u-1");
  });
});
