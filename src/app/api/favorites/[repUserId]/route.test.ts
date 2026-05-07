/**
 * Tests for DELETE /api/favorites/[repUserId] — remove a favorite.
 * Idempotent: returns 200 even when the favorite did not exist.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

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

interface FavoriteRow {
  id: string;
  raterUserId: string;
  repUserId: string;
  createdAt: Date;
}
const state: { favorites: FavoriteRow[] } = { favorites: [] };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    favorite: {
      deleteMany: vi.fn(
        async (args: {
          where: { raterUserId: string; repUserId: string };
        }) => {
          const before = state.favorites.length;
          state.favorites = state.favorites.filter(
            (f) =>
              !(
                f.raterUserId === args.where.raterUserId &&
                f.repUserId === args.where.repUserId
              ),
          );
          return { count: before - state.favorites.length };
        },
      ),
    },
  },
}));

async function callDelete(repUserId: string): Promise<Response> {
  const mod = await import("./route");
  return mod.DELETE(
    new Request(`http://localhost/api/favorites/${repUserId}`, {
      method: "DELETE",
    }),
    { params: Promise.resolve({ repUserId }) },
  );
}

beforeEach(() => {
  mockSession = { user: { id: "rater-1", role: "RATER" } };
  state.favorites = [];
});

describe("DELETE /api/favorites/[repUserId]", () => {
  it("returns 401 with no session", async () => {
    mockSession = null;
    const res = await callDelete("rep-1");
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is not a RATER", async () => {
    mockSession = { user: { id: "u-mgr", role: "SALES_MANAGER" } };
    const res = await callDelete("rep-1");
    expect(res.status).toBe(403);
  });

  it("removes an existing favorite (count=1)", async () => {
    state.favorites.push({
      id: "fav-1",
      raterUserId: "rater-1",
      repUserId: "rep-1",
      createdAt: new Date(),
    });
    const res = await callDelete("rep-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.removed).toBe(1);
    expect(state.favorites).toHaveLength(0);
  });

  it("is idempotent: 200 with removed=0 when not present", async () => {
    const res = await callDelete("rep-doesnt-exist");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.removed).toBe(0);
  });

  it("doesn't touch another rater's favorite for the same rep", async () => {
    state.favorites.push({
      id: "fav-other",
      raterUserId: "rater-OTHER",
      repUserId: "rep-1",
      createdAt: new Date(),
    });
    const res = await callDelete("rep-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.removed).toBe(0);
    expect(state.favorites).toHaveLength(1);
  });
});
