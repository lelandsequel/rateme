/**
 * Tests for /api/favorites — POST (create / dedupe) and GET (list).
 *
 * Mocks `@/lib/auth` for session control + `@/lib/prisma` with a hand-rolled
 * in-memory store covering only the surface the route touches. Same pattern
 * as the notifications/register tests.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Auth mock — flips per test.
// ---------------------------------------------------------------------------
let mockSession:
  | { user: { id: string; role: string; email?: string; name?: string } }
  | null = { user: { id: "rater-1", role: "RATER" } };

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

// ---------------------------------------------------------------------------
// Prisma mock — only the surfaces /api/favorites uses.
// ---------------------------------------------------------------------------
interface UserRow {
  id: string;
  role: string;
  name: string;
  state: string;
  avatarUrl: string | null;
  repProfile?: {
    title: string;
    company: string;
    metroArea: string | null;
    industry: { slug: string; name: string };
  } | null;
  ratingsReceived?: Array<{
    responsiveness: number;
    productKnowledge: number;
    followThrough: number;
    listeningNeedsFit: number;
    trustIntegrity: number;
    takeCallAgain: boolean;
    createdAt: Date;
  }>;
}

interface FavoriteRow {
  id: string;
  raterUserId: string;
  repUserId: string;
  createdAt: Date;
}

const state: {
  users: UserRow[];
  favorites: FavoriteRow[];
  nextId: number;
} = { users: [], favorites: [], nextId: 1 };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async (args: { where: { id: string } }) => {
        return state.users.find((u) => u.id === args.where.id) ?? null;
      }),
    },
    favorite: {
      findUnique: vi.fn(
        async (args: {
          where: {
            raterUserId_repUserId: { raterUserId: string; repUserId: string };
          };
        }) => {
          const k = args.where.raterUserId_repUserId;
          return (
            state.favorites.find(
              (f) => f.raterUserId === k.raterUserId && f.repUserId === k.repUserId,
            ) ?? null
          );
        },
      ),
      findMany: vi.fn(
        async (args: {
          where: { raterUserId: string };
          orderBy?: unknown;
          include?: unknown;
        }) => {
          const rows = state.favorites
            .filter((f) => f.raterUserId === args.where.raterUserId)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          return rows.map((f) => {
            const rep = state.users.find((u) => u.id === f.repUserId);
            return {
              ...f,
              rep: rep
                ? {
                    id: rep.id,
                    name: rep.name,
                    state: rep.state,
                    avatarUrl: rep.avatarUrl,
                    repProfile: rep.repProfile ?? null,
                    ratingsReceived: rep.ratingsReceived ?? [],
                  }
                : null,
            };
          });
        },
      ),
      create: vi.fn(
        async (args: {
          data: { raterUserId: string; repUserId: string };
        }) => {
          const row: FavoriteRow = {
            id: `fav-${state.nextId++}`,
            raterUserId: args.data.raterUserId,
            repUserId: args.data.repUserId,
            createdAt: new Date(),
          };
          state.favorites.push(row);
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
  return new Request("http://localhost/api/favorites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function callPost(body: unknown): Promise<Response> {
  const mod = await import("./route");
  return mod.POST(makeRequest(body));
}

async function callGet(): Promise<Response> {
  const mod = await import("./route");
  return mod.GET();
}

beforeEach(() => {
  mockSession = { user: { id: "rater-1", role: "RATER" } };
  state.users = [
    {
      id: "rep-1",
      role: "REP",
      name: "Diego",
      state: "TX",
      avatarUrl: null,
      repProfile: {
        title: "AE",
        company: "Acme",
        metroArea: "Houston, TX",
        industry: { slug: "saas", name: "SaaS" },
      },
      ratingsReceived: [],
    },
    {
      id: "rep-2",
      role: "REP",
      name: "Maya",
      state: "CA",
      avatarUrl: null,
      repProfile: {
        title: "Sr AE",
        company: "Globex",
        metroArea: null,
        industry: { slug: "saas", name: "SaaS" },
      },
      ratingsReceived: [],
    },
    { id: "rater-1", role: "RATER", name: "Bulma", state: "TX", avatarUrl: null },
    { id: "user-other", role: "RATER", name: "Other", state: "TX", avatarUrl: null },
  ];
  state.favorites = [];
  state.nextId = 1;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("POST /api/favorites", () => {
  it("returns 401 when there is no session", async () => {
    mockSession = null;
    const res = await callPost({ repUserId: "rep-1" });
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not a RATER", async () => {
    mockSession = { user: { id: "rep-1", role: "REP" } };
    const res = await callPost({ repUserId: "rep-2" });
    expect(res.status).toBe(403);
  });

  it("returns 400 when repUserId is missing", async () => {
    const res = await callPost({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when trying to favorite self", async () => {
    const res = await callPost({ repUserId: "rater-1" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when target is not a REP", async () => {
    const res = await callPost({ repUserId: "user-other" });
    expect(res.status).toBe(404);
  });

  it("creates a Favorite and returns it (alreadyExisted=false)", async () => {
    const res = await callPost({ repUserId: "rep-1" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alreadyExisted).toBe(false);
    expect(body.favorite.repUserId).toBe("rep-1");
    expect(body.favorite.raterUserId).toBe("rater-1");
    expect(state.favorites).toHaveLength(1);
  });

  it("is idempotent: returns existing row with alreadyExisted=true on dup", async () => {
    state.favorites.push({
      id: "fav-existing",
      raterUserId: "rater-1",
      repUserId: "rep-1",
      createdAt: new Date(),
    });
    const res = await callPost({ repUserId: "rep-1" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alreadyExisted).toBe(true);
    expect(body.favorite.id).toBe("fav-existing");
    expect(state.favorites).toHaveLength(1);
  });
});

describe("GET /api/favorites", () => {
  it("returns 401 when there is no session", async () => {
    mockSession = null;
    const res = await callGet();
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not a RATER", async () => {
    mockSession = { user: { id: "rep-1", role: "REP" } };
    const res = await callGet();
    expect(res.status).toBe(403);
  });

  it("returns the list of favorites with rep info populated", async () => {
    state.favorites.push(
      {
        id: "fav-1",
        raterUserId: "rater-1",
        repUserId: "rep-1",
        createdAt: new Date("2026-04-01"),
      },
      {
        id: "fav-2",
        raterUserId: "rater-1",
        repUserId: "rep-2",
        createdAt: new Date("2026-04-10"),
      },
    );
    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.favorites).toHaveLength(2);
    // Newest first.
    expect(body.favorites[0].id).toBe("fav-2");
    expect(body.favorites[0].rep.name).toBe("Maya");
    expect(body.favorites[0].rep.title).toBe("Sr AE");
    expect(body.favorites[0].aggregates.status).toBeDefined();
    expect(body.favorites[1].rep.name).toBe("Diego");
  });
});
