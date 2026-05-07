/**
 * Tests for POST /api/auth/verify-email.
 *
 * Covers:
 *  - Happy path: valid email-verify token → 200 + user.emailVerifiedAt set.
 *  - Missing token → 400.
 *  - Wrong-kind token (password-reset) → 400.
 *  - Already-consumed token → 400 on replay.
 *  - Bogus token → 400.
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
  emailVerifiedAt: Date | null;
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
          data: { emailVerifiedAt: Date };
        }) => {
          const row = userTable.rows.find((r) => r.id === args.where.id);
          if (row) row.emailVerifiedAt = args.data.emailVerifiedAt;
          return row;
        },
      ),
    },
    authToken: {
      create: vi.fn(
        async (args: {
          data: {
            userId: string;
            kind: string;
            tokenHash: string;
            expiresAt: Date;
          };
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

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function callRoute(body: unknown): Promise<Response> {
  const mod = await import("./route");
  return mod.POST(makeRequest(body));
}

async function issueVerifyToken(userId: string): Promise<string> {
  const { issueAuthToken, EMAIL_VERIFY_TTL_MS } = await import(
    "@/lib/auth-tokens"
  );
  const issued = await issueAuthToken(
    userId,
    "email-verify",
    EMAIL_VERIFY_TTL_MS,
  );
  return issued.rawToken;
}

beforeEach(() => {
  envState.HAS_DB = true;
  userTable.rows = [
    { id: "user-1", email: "real@user.com", emailVerifiedAt: null },
  ];
  tokenTable.rows = [];
  nextTokId = 1;
});

describe("POST /api/auth/verify-email", () => {
  it("happy path — sets emailVerifiedAt to a Date and consumes the token", async () => {
    const raw = await issueVerifyToken("user-1");
    const res = await callRoute({ token: raw });
    expect(res.status).toBe(200);
    expect(userTable.rows[0].emailVerifiedAt).toBeInstanceOf(Date);
    expect(tokenTable.rows[0].consumedAt).not.toBeNull();
  });

  it("returns 400 when token is missing", async () => {
    const res = await callRoute({});
    expect(res.status).toBe(400);
    expect(userTable.rows[0].emailVerifiedAt).toBeNull();
  });

  it("returns 400 with a wrong-kind token (password-reset)", async () => {
    const { issueAuthToken, PASSWORD_RESET_TTL_MS } = await import(
      "@/lib/auth-tokens"
    );
    const issued = await issueAuthToken(
      "user-1",
      "password-reset",
      PASSWORD_RESET_TTL_MS,
    );
    const res = await callRoute({ token: issued.rawToken });
    expect(res.status).toBe(400);
    expect(userTable.rows[0].emailVerifiedAt).toBeNull();
  });

  it("returns 400 on token replay", async () => {
    const raw = await issueVerifyToken("user-1");
    const ok = await callRoute({ token: raw });
    expect(ok.status).toBe(200);
    const replay = await callRoute({ token: raw });
    expect(replay.status).toBe(400);
  });

  it("returns 400 with a bogus token", async () => {
    const res = await callRoute({ token: "bogus-token" });
    expect(res.status).toBe(400);
  });
});
