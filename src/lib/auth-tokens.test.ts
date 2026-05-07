/**
 * Tests for src/lib/auth-tokens.ts.
 *
 * We replace `@/lib/prisma` with a hand-rolled in-memory `authToken` table
 * so the issue/consume helpers can exercise their full state machine
 * (create → consume → reject-on-reuse, expiry, kind mismatch) without
 * touching a real database.
 *
 * Test plan:
 *   1. issue + consume happy path returns userId.
 *   2. expired tokens reject (consume returns null).
 *   3. wrong-kind reject (issue email-verify, consume password-reset).
 *   4. consumed tokens cannot be reused.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

interface AuthTokenRow {
  id: string;
  userId: string;
  kind: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

const tokenTable: { rows: AuthTokenRow[] } = { rows: [] };

let nextId = 1;

vi.mock("@/lib/prisma", () => ({
  prisma: {
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
            id: `tok-${nextId++}`,
            userId: args.data.userId,
            kind: args.data.kind,
            tokenHash: args.data.tokenHash,
            expiresAt: args.data.expiresAt,
            consumedAt: null,
            createdAt: new Date(),
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

beforeEach(() => {
  tokenTable.rows = [];
  nextId = 1;
});

describe("issueAuthToken + consumeAuthToken", () => {
  it("issues a token and consumes it for the same kind (happy path)", async () => {
    const { issueAuthToken, consumeAuthToken, PASSWORD_RESET_TTL_MS } =
      await import("./auth-tokens");

    const issued = await issueAuthToken(
      "user-1",
      "password-reset",
      PASSWORD_RESET_TTL_MS,
    );

    expect(typeof issued.rawToken).toBe("string");
    expect(issued.rawToken.length).toBeGreaterThan(20);
    expect(issued.tokenHash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const consumed = await consumeAuthToken(issued.rawToken, "password-reset");
    expect(consumed).toEqual({ userId: "user-1" });
  });

  it("rejects expired tokens", async () => {
    const { issueAuthToken, consumeAuthToken } = await import("./auth-tokens");

    // TTL = 1ms, then wait past it.
    const issued = await issueAuthToken("user-2", "password-reset", 1);
    await new Promise((r) => setTimeout(r, 5));

    const consumed = await consumeAuthToken(issued.rawToken, "password-reset");
    expect(consumed).toBeNull();
  });

  it("rejects when the kind doesn't match", async () => {
    const { issueAuthToken, consumeAuthToken, EMAIL_VERIFY_TTL_MS } =
      await import("./auth-tokens");

    const issued = await issueAuthToken(
      "user-3",
      "email-verify",
      EMAIL_VERIFY_TTL_MS,
    );

    const consumed = await consumeAuthToken(issued.rawToken, "password-reset");
    expect(consumed).toBeNull();

    // Original kind still works after the wrong-kind probe (we did NOT
    // mark consumed on a kind miss).
    const ok = await consumeAuthToken(issued.rawToken, "email-verify");
    expect(ok).toEqual({ userId: "user-3" });
  });

  it("rejects a second consume of the same token", async () => {
    const { issueAuthToken, consumeAuthToken, PASSWORD_RESET_TTL_MS } =
      await import("./auth-tokens");

    const issued = await issueAuthToken(
      "user-4",
      "password-reset",
      PASSWORD_RESET_TTL_MS,
    );

    const first = await consumeAuthToken(issued.rawToken, "password-reset");
    expect(first).toEqual({ userId: "user-4" });

    const second = await consumeAuthToken(issued.rawToken, "password-reset");
    expect(second).toBeNull();
  });

  it("rejects unknown / garbage tokens", async () => {
    const { consumeAuthToken } = await import("./auth-tokens");
    const result = await consumeAuthToken("not-a-real-token", "password-reset");
    expect(result).toBeNull();
  });
});
