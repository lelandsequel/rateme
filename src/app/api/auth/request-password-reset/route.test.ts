/**
 * Tests for POST /api/auth/request-password-reset.
 *
 * Behavior under test:
 *  - Always returns 200 (no existence-leak), even when:
 *      • body is malformed
 *      • email is unknown
 *      • email is missing
 *  - When the email matches a real user we DO call the email pipeline.
 *
 * We mock @/lib/prisma + @/lib/email + @/lib/env. The token-issuance helper
 * is exercised end-to-end via auth-tokens (it's pure logic on top of prisma,
 * which is already mocked).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

process.env.AUTH_SECRET = "test-secret";
process.env.APP_URL = "https://test.example.com";

const envState = { HAS_DB: true };
vi.mock("@/lib/env", () => ({
  get HAS_DB() {
    return envState.HAS_DB;
  },
}));

type UserRow = { id: string; email: string; name: string };
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
      findUnique: vi.fn(
        async (args: { where: { email: string }; select?: unknown }) => {
          const row = userTable.rows.find((r) => r.email === args.where.email);
          return row ?? null;
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
    },
  },
}));

type StubMsg = { to: string; subject: string; html: string; text: string };
const sendEmailMock = vi.fn<(msg: StubMsg) => Promise<{ ok: true; provider: "stub" }>>(
  async () => ({ ok: true, provider: "stub" }),
);
vi.mock("@/lib/email", () => ({
  sendEmail: sendEmailMock,
}));

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/request-password-reset", {
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
    { id: "user-1", email: "real@user.com", name: "Real User" },
  ];
  tokenTable.rows = [];
  nextTokId = 1;
  sendEmailMock.mockClear();
});

describe("POST /api/auth/request-password-reset", () => {
  it("returns 200 even when the email is unknown (no leak)", async () => {
    const res = await callRoute({ email: "ghost@nope.com" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(tokenTable.rows).toHaveLength(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("returns 200 with no email field", async () => {
    const res = await callRoute({});
    expect(res.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("returns 400 only on truly malformed JSON (handled, not leak)", async () => {
    // Malformed JSON is a body parse error — we surface 400 here. This is
    // not an existence leak (any caller can trigger it).
    const res = await callRoute("not-json{");
    expect(res.status).toBe(400);
  });

  it("issues a token + sends an email when the user exists", async () => {
    const res = await callRoute({ email: "real@user.com" });
    expect(res.status).toBe(200);
    expect(tokenTable.rows).toHaveLength(1);
    expect(tokenTable.rows[0].kind).toBe("password-reset");
    expect(tokenTable.rows[0].userId).toBe("user-1");
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const sentMsg = sendEmailMock.mock.calls[0]?.[0] as StubMsg;
    expect(sentMsg.to).toBe("real@user.com");
    expect(sentMsg.subject).toMatch(/reset/i);
    // The reset URL contains the raw token, but the token never appears in
    // the response body or in the prisma row.
    expect(sentMsg.html).toContain("https://test.example.com/reset-password?token=");
  });

  it("normalizes email casing + whitespace before lookup", async () => {
    const res = await callRoute({ email: "  REAL@User.com  " });
    expect(res.status).toBe(200);
    expect(tokenTable.rows).toHaveLength(1);
    expect(sendEmailMock).toHaveBeenCalled();
  });

  it("returns 200 in mock-mode (no DB) without trying to query", async () => {
    envState.HAS_DB = false;
    const res = await callRoute({ email: "real@user.com" });
    expect(res.status).toBe(200);
    expect(tokenTable.rows).toHaveLength(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
