/**
 * Tests for POST /api/notifications/register.
 *
 * Mocking strategy:
 *  - `@/lib/env` is mocked so HAS_DB can flip per test (mock-mode 503 case).
 *  - `@/lib/auth` exports `requireSession`, which we stub to either throw a
 *    401 Response (matching the production behavior) or return a fake session.
 *    No real next-auth/JWT machinery is exercised — this matches the
 *    project's lightweight test posture (no API tests existed before).
 *  - `@/lib/prisma` is mocked to a thin in-memory object exposing the
 *    `pUSH_TOKEN.upsert` shape the route uses. We don't introduce a new
 *    mocking framework — just vi.mock + a hand-rolled fake.
 *
 * Note on import order: `vi.mock` calls are hoisted, but the route module is
 * imported lazily inside each test (after configuring mocks) to keep things
 * readable and ensure `HAS_DB` is read at the right moment.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — hoisted by vitest to the top of the module.
// ---------------------------------------------------------------------------

// Stateful HAS_DB flag controlled by tests.
const envState = { HAS_DB: true };
vi.mock("@/lib/env", () => ({
  get HAS_DB() {
    return envState.HAS_DB;
  },
}));

// Auth mock: tests reassign `mockSession` (or set it to null) and the stub
// uses it to either throw 401 or return.
let mockSession:
  | { user: { id: string; role: string; email?: string; name?: string } }
  | null = {
    user: { id: "user-1", role: "REP" },
  };

vi.mock("@/lib/auth", () => ({
  requireSession: vi.fn(async () => {
    if (!mockSession?.user) {
      throw new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }
    return mockSession;
  }),
}));

// Hand-rolled in-memory prisma fake. Only the surface the route touches is
// implemented. `_rows` is exposed via the module export so tests can seed +
// inspect state.
type Row = {
  id: string;
  token: string;
  platform: string;
  userId: string;
  createdAt: Date;
  lastSeenAt: Date;
};

const prismaState: { rows: Row[]; nextId: number } = { rows: [], nextId: 1 };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pushToken: {
      upsert: vi.fn(
        async (args: {
          where: { token: string };
          create: { token: string; platform: string; userId: string };
          update: { platform: string; userId: string };
        }) => {
          const existing = prismaState.rows.find((r) => r.token === args.where.token);
          const now = new Date();
          if (existing) {
            existing.platform = args.update.platform;
            existing.userId = args.update.userId;
            existing.lastSeenAt = now;
            return existing;
          }
          const row: Row = {
            id: `pt-${prismaState.nextId++}`,
            token: args.create.token,
            platform: args.create.platform,
            userId: args.create.userId,
            createdAt: now,
            lastSeenAt: now,
          };
          prismaState.rows.push(row);
          return row;
        },
      ),
    },
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/notifications/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function callRoute(body: unknown): Promise<Response> {
  // Lazy-import so the mocked HAS_DB getter is read fresh per call.
  const mod = await import("./route");
  return mod.POST(makeRequest(body));
}

beforeEach(() => {
  envState.HAS_DB = true;
  mockSession = { user: { id: "user-1", role: "REP" } };
  prismaState.rows = [];
  prismaState.nextId = 1;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/notifications/register", () => {
  it("returns 401 when there is no session", async () => {
    mockSession = null;
    const res = await callRoute({ token: "ExponentPushToken[abc]", platform: "expo" });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 when token is missing", async () => {
    const res = await callRoute({ platform: "expo" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/token/i);
  });

  it("returns 400 when token is an empty string", async () => {
    const res = await callRoute({ token: "", platform: "expo" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/token/i);
  });

  it("returns 400 when platform is an unknown value", async () => {
    const res = await callRoute({ token: "ExponentPushToken[abc]", platform: "blackberry" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/platform/i);
  });

  it("returns 200 and creates a PUSH_TOKEN row when token is new", async () => {
    const res = await callRoute({
      token: "ExponentPushToken[new123]",
      platform: "expo",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe("ExponentPushToken[new123]");
    expect(body.platform).toBe("expo");
    expect(body.userId).toBe("user-1");
    expect(body.id).toBe("pt-1");
    expect(prismaState.rows.length).toBe(1);
  });

  it("returns 200 and updates lastSeenAt when token already exists for the same user", async () => {
    // Seed an existing row owned by user-1.
    const seededAt = new Date("2026-04-26T00:00:00Z");
    prismaState.rows.push({
      id: "pt-existing",
      token: "ExponentPushToken[same]",
      platform: "expo",
      userId: "user-1",
      createdAt: seededAt,
      lastSeenAt: seededAt,
    });

    const res = await callRoute({
      token: "ExponentPushToken[same]",
      platform: "expo",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("pt-existing");
    expect(body.userId).toBe("user-1");
    // lastSeenAt should have been bumped past the seeded value.
    expect(new Date(body.lastSeenAt).getTime()).toBeGreaterThan(seededAt.getTime());
    expect(prismaState.rows.length).toBe(1);
  });

  it("returns 200 and reassigns userId when token already exists for a DIFFERENT user (device reuse)", async () => {
    // Seed a row owned by a different user. Device was handed off / signed
    // out and signed back in as user-1.
    prismaState.rows.push({
      id: "pt-handoff",
      token: "ExponentPushToken[handoff]",
      platform: "expo",
      userId: "user-other",
      createdAt: new Date("2026-04-25T00:00:00Z"),
      lastSeenAt: new Date("2026-04-25T00:00:00Z"),
    });

    const res = await callRoute({
      token: "ExponentPushToken[handoff]",
      platform: "expo",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("pt-handoff");
    expect(body.userId).toBe("user-1");
    // Still a single row — upsert reassigned, didn't duplicate.
    expect(prismaState.rows.length).toBe(1);
  });

  it("returns 503 in mock mode (HAS_DB=false)", async () => {
    envState.HAS_DB = false;
    const res = await callRoute({
      token: "ExponentPushToken[mockmode]",
      platform: "expo",
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/no DB/i);
    // No DB write attempted.
    expect(prismaState.rows.length).toBe(0);
  });
});
