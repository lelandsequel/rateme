/**
 * Tests for POST /api/auth/reset-password.
 *
 * Covers:
 *  - Happy path: valid token + strong password → 200, passwordHash updated.
 *  - Missing token → 400.
 *  - Weak password → 400.
 *  - Wrong-kind token (email-verify) → 400.
 *  - Already-consumed token → 400 on second submit.
 *  - Expired token → 400.
 *
 * Mocks: prisma user + authToken tables, bcrypt.hash, env.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

process.env.AUTH_SECRET = "test-secret";

const envState = { HAS_DB: true };
vi.mock("@/lib/env", () => ({
  get HAS_DB() {
    return envState.HAS_DB;
  },
}));

interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
}
const userTable: { rows: UserRow[] } = { rows: [] };

interface AuthTokenRow {
  id: string;
  userId: string;
  kind: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
}
const tokenTable: { rows: AuthTokenRow[] } = { rows: [] };
let nextTokId = 1;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      update: vi.fn(
        async (args: {
          where: { id: string };
          data: { passwordHash: string };
        }) => {
          const row = userTable.rows.find((r) => r.id === args.where.id);
          if (row) row.passwordHash = args.data.passwordHash;
          return row;
        },
      ),
    },
    authToken: {
      create: vi.fn(
        async (args: {
          data: { userId: string; kind: string; tokenHash: string; expiresAt: Date };
        }) => {
          const row: AuthTokenRow = {
            id: `tok-${nextTokId++}`,
            userId: args.data.userId,
            kind: args.data.kind,
            tokenHash: args.data.tokenHash,
            expiresAt: args.data.expiresAt,
            consumedAt: null,
          };
          tokenTable.rows.push(row);
          return row;
        },
      ),
      findUnique: vi.fn(
        async (args: { where: { tokenHash: string } }) => {
          return (
            tokenTable.rows.find((r) => r.tokenHash === args.where.tokenHash) ??
            null
          );
        },
      ),
      updateMany: vi.fn(
        async (args: {
          where: { id: string; consumedAt: null };
          data: { consumedAt: Date };
        }) => {
          const row = tokenTable.rows.find(
            (r) => r.id === args.where.id && r.consumedAt === null,
          );
          if (!row) return { count: 0 };
          row.consumedAt = args.data.consumedAt;
          return { count: 1 };
        },
      ),
    },
  },
}));

vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn(async (plain: string) => `hashed:${plain}`),
  },
  hash: vi.fn(async (plain: string) => `hashed:${plain}`),
}));

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function callRoute(body: unknown): Promise<Response> {
  const mod = await import("./route");
  return mod.POST(makeRequest(body));
}

async function issueResetToken(userId: string): Promise<string> {
  const { issueAuthToken, PASSWORD_RESET_TTL_MS } = await import(
    "@/lib/auth-tokens"
  );
  const issued = await issueAuthToken(
    userId,
    "password-reset",
    PASSWORD_RESET_TTL_MS,
  );
  return issued.rawToken;
}

beforeEach(() => {
  envState.HAS_DB = true;
  userTable.rows = [
    { id: "user-1", email: "real@user.com", passwordHash: "$2b$10$old" },
  ];
  tokenTable.rows = [];
  nextTokId = 1;
});

describe("POST /api/auth/reset-password", () => {
  it("happy path — updates passwordHash with bcrypt-hashed new password", async () => {
    const raw = await issueResetToken("user-1");
    const res = await callRoute({ token: raw, newPassword: "betterpass123" });
    expect(res.status).toBe(200);
    expect(userTable.rows[0].passwordHash).toBe("hashed:betterpass123");
    // Token marked consumed.
    expect(tokenTable.rows[0].consumedAt).not.toBeNull();
  });

  it("returns 400 when token is missing", async () => {
    const res = await callRoute({ newPassword: "betterpass123" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when the password is too short", async () => {
    const raw = await issueResetToken("user-1");
    const res = await callRoute({ token: raw, newPassword: "short" });
    expect(res.status).toBe(400);
    // Token still un-consumed because we bail before consume.
    expect(tokenTable.rows[0].consumedAt).toBeNull();
    expect(userTable.rows[0].passwordHash).toBe("$2b$10$old");
  });

  it("returns 400 with a wrong-kind token (email-verify)", async () => {
    const { issueAuthToken, EMAIL_VERIFY_TTL_MS } = await import(
      "@/lib/auth-tokens"
    );
    const issued = await issueAuthToken(
      "user-1",
      "email-verify",
      EMAIL_VERIFY_TTL_MS,
    );
    const res = await callRoute({
      token: issued.rawToken,
      newPassword: "betterpass123",
    });
    expect(res.status).toBe(400);
    expect(userTable.rows[0].passwordHash).toBe("$2b$10$old");
  });

  it("returns 400 when the token has already been consumed", async () => {
    const raw = await issueResetToken("user-1");
    // First submit succeeds.
    const ok = await callRoute({ token: raw, newPassword: "betterpass123" });
    expect(ok.status).toBe(200);
    // Second submit with the same token must fail.
    const replay = await callRoute({ token: raw, newPassword: "anotherone8" });
    expect(replay.status).toBe(400);
  });

  it("returns 400 when the token has expired", async () => {
    const { issueAuthToken } = await import("@/lib/auth-tokens");
    const issued = await issueAuthToken("user-1", "password-reset", 1);
    await new Promise((r) => setTimeout(r, 5));
    const res = await callRoute({
      token: issued.rawToken,
      newPassword: "betterpass123",
    });
    expect(res.status).toBe(400);
    expect(userTable.rows[0].passwordHash).toBe("$2b$10$old");
  });

  it("returns 400 with a totally unknown token", async () => {
    const res = await callRoute({
      token: "not-real-token",
      newPassword: "betterpass123",
    });
    expect(res.status).toBe(400);
  });
});
