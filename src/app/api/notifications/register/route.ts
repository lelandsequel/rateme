/**
 * POST /api/notifications/register
 *
 * Registers an Expo push token for the authenticated user. Called by the
 * mobile companion (lelandsequel/ratememobile) on app start.
 *
 * Body:   { token: string, platform?: "expo"|"ios"|"android" }
 * Auth:   required (next-auth session OR mobile Bearer token).
 * Mock:   HAS_DB=false → 503 (no place to persist; mobile swallows).
 *
 * Behavior: upsert by token. If the token already exists under a DIFFERENT
 * user — meaning the device was handed off / the user signed in as someone
 * else — reassign ownership to the current session user. Expo tokens are
 * device-bound, so a token-conflict signals "device changed who's logged
 * in," not a duplicate to reject.
 */

import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HAS_DB } from "@/lib/env";

const VALID_PLATFORMS = new Set(["expo", "ios", "android"]);
const MAX_TOKEN_LEN = 300;

export async function POST(request: Request) {
  return handle(async () => {
    // Auth first — an unauthed caller shouldn't learn anything about the
    // backend's storage mode.
    const session = await requireSession();
    const userId = session.user.id;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return Response.json({ error: "Invalid body" }, { status: 400 });
    }

    const raw = body as { token?: unknown; platform?: unknown };

    const token = raw.token;
    if (typeof token !== "string" || token.length === 0) {
      return Response.json(
        { error: "token is required (non-empty string)" },
        { status: 400 },
      );
    }
    if (token.length > MAX_TOKEN_LEN) {
      return Response.json(
        { error: `token exceeds max length (${MAX_TOKEN_LEN})` },
        { status: 400 },
      );
    }

    // Platform: optional; defaults to "expo". If provided, must be valid.
    let platform: string = "expo";
    if (raw.platform !== undefined) {
      if (typeof raw.platform !== "string" || !VALID_PLATFORMS.has(raw.platform)) {
        return Response.json(
          {
            error: `Invalid platform; expected one of ${[...VALID_PLATFORMS].join(",")}`,
          },
          { status: 400 },
        );
      }
      platform = raw.platform;
    }

    // Mock mode: nowhere to persist. Mobile swallows the 503 gracefully.
    if (!HAS_DB) {
      return Response.json(
        { error: "no DB; push registration requires backend" },
        { status: 503 },
      );
    }

    // Upsert by token. If the token already exists under any user (same or
    // different), update lastSeenAt + reassign ownership to the current
    // session user/tenant. Otherwise create a fresh row.
    const row = await prisma.pushToken.upsert({
      where: { token },
      create: {
        token,
        platform,
        userId,
      },
      update: {
        platform,
        userId,
        // lastSeenAt updates automatically via @updatedAt on any write.
      },
    });

    return {
      id: row.id,
      token: row.token,
      platform: row.platform,
      userId: row.userId,
      lastSeenAt: row.lastSeenAt,
    };
  });
}
