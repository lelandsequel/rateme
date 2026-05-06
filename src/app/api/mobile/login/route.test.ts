/**
 * Tests for POST /api/mobile/login.
 *
 * Mocking strategy:
 *  - `@/lib/env` is mocked so HAS_DB can flip per test.
 *  - `@/lib/prisma` is mocked to a thin in-memory `user.findUnique` +
 *    `user.update`. We don't run real Prisma.
 *  - `bcrypt.compare` is mocked to compare against a known plaintext so
 *    tests don't need a real hash on disk.
 *  - AUTH_SECRET is set so the real jose-based signMobileToken can run
 *    end-to-end. We round-trip through verifyMobileToken to confirm.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

process.env.AUTH_SECRET = "test-auth-secret-do-not-use-in-prod";

const envState = { HAS_DB: true };
vi.mock("@/lib/env", () => ({
  get HAS_DB() {
    return envState.HAS_DB;
  },
}));

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  passwordHash: string | null;
  lastLoginAt: Date | null;
};

const userTable: { rows: UserRow[] } = { rows: [] };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async (args: { where: { email: string } }) => {
        return userTable.rows.find((r) => r.email === args.where.email) ?? null;
      }),
      update: vi.fn(
        async (args: { where: { id: string }; data: { lastLoginAt: Date } }) => {
          const row = userTable.rows.find((r) => r.id === args.where.id);
          if (row) row.lastLoginAt = args.data.lastLoginAt;
          return row;
        },
      ),
    },
  },
}));

vi.mock("bcrypt", () => ({
  default: {
    compare: vi.fn(async (plain: string) => plain === "rightpass"),
  },
  compare: vi.fn(async (plain: string) => plain === "rightpass"),
}));

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/mobile/login", {
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
  envState.HAS_DB = true;
  userTable.rows = [
    {
      id: "user-1",
      email: "real@user.com",
      name: "Real User",
      role: "REP",
      passwordHash: "$2b$10$fakehash",
      lastLoginAt: null,
    },
  ];
});

describe("POST /api/mobile/login", () => {
  it("returns 400 when body is not JSON", async () => {
    const res = await callRoute("not-json{");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/JSON/i);
  });

  it("returns 400 when email is missing", async () => {
    const res = await callRoute({ password: "rightpass" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is missing", async () => {
    const res = await callRoute({ email: "real@user.com" });
    expect(res.status).toBe(400);
  });

  it("returns 401 when user does not exist (DB mode)", async () => {
    const res = await callRoute({ email: "nope@user.com", password: "rightpass" });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/credentials/i);
  });

  it("returns 401 when password is wrong (DB mode)", async () => {
    const res = await callRoute({ email: "real@user.com", password: "wrongpass" });
    expect(res.status).toBe(401);
  });

  it("returns 200 with a verifiable token + user on success (DB mode)", async () => {
    const res = await callRoute({ email: "real@user.com", password: "rightpass" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.token).toBe("string");
    expect(body.user).toEqual({
      id: "user-1",
      email: "real@user.com",
      name: "Real User",
      role: "REP",
    });

    const { verifyMobileToken } = await import("@/lib/mobile-token");
    const payload = await verifyMobileToken(body.token);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe("user-1");
    expect(payload?.role).toBe("REP");
  });

  it("touches lastLoginAt on successful login (DB mode)", async () => {
    expect(userTable.rows[0].lastLoginAt).toBeNull();
    await callRoute({ email: "real@user.com", password: "rightpass" });
    expect(userTable.rows[0].lastLoginAt).toBeInstanceOf(Date);
  });

  it("returns 200 with mock seed creds in mock mode", async () => {
    envState.HAS_DB = false;
    const res = await callRoute({ email: "tj@ratemyrep.com", password: "demo123" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.id).toBe("mock-user-1");
    expect(body.user.role).toBe("SALES_MANAGER");
  });

  it("returns 401 with non-seed creds in mock mode", async () => {
    envState.HAS_DB = false;
    const res = await callRoute({ email: "tj@ratemyrep.com", password: "wrong" });
    expect(res.status).toBe(401);
  });
});
