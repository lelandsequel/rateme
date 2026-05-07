/**
 * Single-use auth tokens for password reset + email verification.
 *
 * Security model:
 *   - Generate 32 random bytes, base64url-encode for the URL.
 *   - Store ONLY sha256(rawToken) on disk. The raw token is never persisted
 *     and must never appear in logs / error messages.
 *   - On consume: hash the candidate, look up by hash, validate kind +
 *     expiry + un-consumed, then mark consumedAt.
 *
 * TTLs (callers pass these):
 *   - password-reset: 60 minutes
 *   - email-verify:   7 days
 */

import { randomBytes, createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";

export type AuthTokenKind = "password-reset" | "email-verify";

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;          // 60 minutes
export const EMAIL_VERIFY_TTL_MS   = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface IssuedToken {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
}

/** sha256 of the raw token, hex-encoded. Never reversible. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Mints a fresh token row for (userId, kind). Returns the raw token (caller
 * embeds it in a URL) plus the stored hash + expiry. The DB row is created
 * synchronously so a follow-up consume is reliable.
 */
export async function issueAuthToken(
  userId: string,
  kind: AuthTokenKind,
  ttlMs: number,
): Promise<IssuedToken> {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + ttlMs);

  await prisma.authToken.create({
    data: {
      userId,
      kind,
      tokenHash,
      expiresAt,
    },
  });

  return { rawToken, tokenHash, expiresAt };
}

/**
 * Validates a raw token: checks the hash exists, matches the requested kind,
 * has not expired, and has not been consumed. On success marks consumedAt
 * (single-use) and returns { userId }. Returns null on any failure — the
 * caller MUST surface a generic error so we don't leak which check tripped.
 *
 * Implementation detail: we run the consume update with a where-clause on
 * consumedAt = null so two concurrent calls can't both succeed.
 */
export async function consumeAuthToken(
  rawToken: string,
  kind: AuthTokenKind,
): Promise<{ userId: string } | null> {
  if (!rawToken || typeof rawToken !== "string") return null;
  const tokenHash = hashToken(rawToken);

  const row = await prisma.authToken.findUnique({ where: { tokenHash } });
  if (!row) return null;
  if (row.kind !== kind) return null;
  if (row.consumedAt != null) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;

  // Race-safe single-shot consume.
  const result = await prisma.authToken.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (result.count !== 1) return null;

  return { userId: row.userId };
}
