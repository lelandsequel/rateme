/**
 * Tests for POST /api/ratings — focused on the RatingRequest completion
 * side-effect added with the rating-request workflow.
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

interface ConnRow {
  id: string;
  repUserId: string;
  raterUserId: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "DISCONNECTED";
}

interface RatingRow {
  id: string;
  connectionId: string;
  repUserId: string;
  raterUserId: string;
  responsiveness: number;
  productKnowledge: number;
  followThrough: number;
  listeningNeedsFit: number;
  trustIntegrity: number;
  takeCallAgain: boolean;
  ratingRequestId: string | null;
  comment: string | null;
  createdAt: Date;
}

interface RRRow {
  id: string;
  type: "ONE_TIME" | "ON_BEHALF";
  status: "PENDING" | "COMPLETED" | "EXPIRED" | "CANCELLED";
  forRepUserId: string;
  initiatedByUserId: string;
  toEmail: string | null;
  toRaterUserId: string | null;
  expiresAt: Date;
  createdAt: Date;
  completedAt: Date | null;
}

interface FavoriteRow {
  id: string;
  raterUserId: string;
  repUserId: string;
  createdAt: Date;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  pushTokens: Array<{ token: string }>;
}

interface NotifLogRow {
  id: string;
  userId: string;
  kind: string;
  payload: string;
  pushSent: boolean;
  emailSent: boolean;
  createdAt: Date;
}

const state: {
  conns: ConnRow[];
  ratings: RatingRow[];
  ratingRequests: RRRow[];
  favorites: FavoriteRow[];
  users: UserRow[];
  notificationLogs: NotifLogRow[];
  nextId: number;
} = {
  conns: [],
  ratings: [],
  ratingRequests: [],
  favorites: [],
  users: [],
  notificationLogs: [],
  nextId: 1,
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    connection: {
      findUnique: vi.fn(
        async (args: {
          where: {
            repUserId_raterUserId?: { repUserId: string; raterUserId: string };
          };
        }) => {
          const k = args.where.repUserId_raterUserId;
          if (!k) return null;
          return (
            state.conns.find(
              (c) => c.repUserId === k.repUserId && c.raterUserId === k.raterUserId,
            ) ?? null
          );
        },
      ),
    },
    rating: {
      create: vi.fn(
        async (args: {
          data: Omit<RatingRow, "id" | "createdAt"> & { createdAt?: Date };
        }) => {
          const row: RatingRow = {
            id: `rt-${state.nextId++}`,
            createdAt: args.data.createdAt ?? new Date(),
            ...args.data,
          };
          state.ratings.push(row);
          return row;
        },
      ),
    },
    ratingRequest: {
      findUnique: vi.fn(async (args: { where: { id: string } }) => {
        return state.ratingRequests.find((r) => r.id === args.where.id) ?? null;
      }),
      update: vi.fn(
        async (args: {
          where: { id: string };
          data: Partial<RRRow>;
        }) => {
          const row = state.ratingRequests.find((r) => r.id === args.where.id);
          if (!row) throw new Error("not found");
          Object.assign(row, args.data);
          return row;
        },
      ),
    },
    favorite: {
      findMany: vi.fn(
        async (args: {
          where: { repUserId: string };
          select?: unknown;
        }) => {
          return state.favorites
            .filter((f) => f.repUserId === args.where.repUserId)
            .map((f) => ({ raterUserId: f.raterUserId }));
        },
      ),
    },
    user: {
      findUnique: vi.fn(async (args: { where: { id: string } }) => {
        return state.users.find((u) => u.id === args.where.id) ?? null;
      }),
      findMany: vi.fn(
        async (args: {
          where: { id: { in: string[] } };
          select?: unknown;
        }) => {
          return state.users
            .filter((u) => args.where.id.in.includes(u.id))
            .map((u) => ({
              id: u.id,
              email: u.email,
              pushTokens: u.pushTokens,
            }));
        },
      ),
    },
    notificationLog: {
      create: vi.fn(
        async (args: {
          data: Omit<NotifLogRow, "id" | "createdAt"> & { createdAt?: Date };
        }) => {
          const row: NotifLogRow = {
            id: `nl-${state.nextId++}`,
            createdAt: args.data.createdAt ?? new Date(),
            ...args.data,
          };
          state.notificationLogs.push(row);
          return row;
        },
      ),
    },
  },
}));

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/ratings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function callRoute(body: unknown): Promise<Response> {
  const mod = await import("./route");
  return mod.POST(makeRequest(body));
}

const validBody = {
  repUserId: "rep-1",
  responsiveness: 5,
  productKnowledge: 4,
  followThrough: 4,
  listeningNeedsFit: 5,
  trustIntegrity: 5,
  takeCallAgain: true,
};

beforeEach(() => {
  mockSession = { user: { id: "rater-1", role: "RATER" } };
  state.conns = [
    { id: "c-1", repUserId: "rep-1", raterUserId: "rater-1", status: "ACCEPTED" },
  ];
  state.ratings = [];
  state.ratingRequests = [];
  state.favorites = [];
  state.users = [
    {
      id: "rep-1",
      name: "Diego",
      email: "diego@example.com",
      pushTokens: [],
    },
    {
      id: "watcher-1",
      name: "Watcher One",
      email: "watcher1@example.com",
      pushTokens: [{ token: "ExponentPushToken[w1]" }],
    },
    {
      id: "watcher-2",
      name: "Watcher Two",
      email: "watcher2@example.com",
      pushTokens: [],
    },
  ];
  state.notificationLogs = [];
  state.nextId = 1;
  // Stub fetch so push/email best-effort calls don't reach the network.
  globalThis.fetch = vi.fn(async () => new Response("ok", { status: 200 })) as unknown as typeof fetch;
});

describe("POST /api/ratings — ratingRequest side-effect", () => {
  it("creates a rating with ratingRequestId=null when none supplied", async () => {
    const res = await callRoute(validBody);
    expect(res.status).toBe(200);
    expect(state.ratings).toHaveLength(1);
    expect(state.ratings[0].ratingRequestId).toBeNull();
  });

  it("400s when ratingRequestId references a non-existent request", async () => {
    const res = await callRoute({ ...validBody, ratingRequestId: "rr-missing" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
    expect(state.ratings).toHaveLength(0);
  });

  it("400s when ratingRequest is for a different rep", async () => {
    state.ratingRequests.push({
      id: "rr-1",
      type: "ON_BEHALF",
      status: "PENDING",
      forRepUserId: "rep-OTHER",
      initiatedByUserId: "mgr-1",
      toEmail: null,
      toRaterUserId: "rater-1",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      completedAt: null,
    });
    const res = await callRoute({ ...validBody, ratingRequestId: "rr-1" });
    expect(res.status).toBe(400);
    expect(state.ratings).toHaveLength(0);
  });

  it("400s when ratingRequest is for a different rater (ON_BEHALF)", async () => {
    state.ratingRequests.push({
      id: "rr-1",
      type: "ON_BEHALF",
      status: "PENDING",
      forRepUserId: "rep-1",
      initiatedByUserId: "mgr-1",
      toEmail: null,
      toRaterUserId: "rater-OTHER",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      completedAt: null,
    });
    const res = await callRoute({ ...validBody, ratingRequestId: "rr-1" });
    expect(res.status).toBe(400);
    expect(state.ratings).toHaveLength(0);
  });

  it("400s when the ratingRequest is already COMPLETED", async () => {
    state.ratingRequests.push({
      id: "rr-1",
      type: "ON_BEHALF",
      status: "COMPLETED",
      forRepUserId: "rep-1",
      initiatedByUserId: "mgr-1",
      toEmail: null,
      toRaterUserId: "rater-1",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      completedAt: new Date(),
    });
    const res = await callRoute({ ...validBody, ratingRequestId: "rr-1" });
    expect(res.status).toBe(400);
    expect(state.ratings).toHaveLength(0);
  });

  it("400s when ratingRequest is past expiresAt", async () => {
    state.ratingRequests.push({
      id: "rr-1",
      type: "ON_BEHALF",
      status: "PENDING",
      forRepUserId: "rep-1",
      initiatedByUserId: "mgr-1",
      toEmail: null,
      toRaterUserId: "rater-1",
      expiresAt: new Date(Date.now() - 60_000),
      createdAt: new Date(),
      completedAt: null,
    });
    const res = await callRoute({ ...validBody, ratingRequestId: "rr-1" });
    expect(res.status).toBe(400);
    expect(state.ratings).toHaveLength(0);
  });

  it("on success, marks the rating with ratingRequestId AND flips the request to COMPLETED", async () => {
    state.ratingRequests.push({
      id: "rr-1",
      type: "ON_BEHALF",
      status: "PENDING",
      forRepUserId: "rep-1",
      initiatedByUserId: "mgr-1",
      toEmail: null,
      toRaterUserId: "rater-1",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      completedAt: null,
    });
    const res = await callRoute({ ...validBody, ratingRequestId: "rr-1" });
    expect(res.status).toBe(200);
    expect(state.ratings).toHaveLength(1);
    expect(state.ratings[0].ratingRequestId).toBe("rr-1");
    expect(state.ratingRequests[0].status).toBe("COMPLETED");
    expect(state.ratingRequests[0].completedAt).not.toBeNull();
  });

  it("backfills toRaterUserId on a ONE_TIME request when completed", async () => {
    state.ratingRequests.push({
      id: "rr-1",
      type: "ONE_TIME",
      status: "PENDING",
      forRepUserId: "rep-1",
      initiatedByUserId: "rep-1",
      toEmail: "rater@example.com",
      toRaterUserId: null,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      completedAt: null,
    });
    const res = await callRoute({ ...validBody, ratingRequestId: "rr-1" });
    expect(res.status).toBe(200);
    expect(state.ratingRequests[0].toRaterUserId).toBe("rater-1");
    expect(state.ratingRequests[0].status).toBe("COMPLETED");
  });
});

// ---------------------------------------------------------------------------
// Favorite-driven notification fan-out.
//
// On rating-create, every Rater whose Favorite points at the freshly-rated
// Rep should get a NotificationLog row. Push + email are best-effort and
// MUST NOT block or fail the rating-create response.
// ---------------------------------------------------------------------------

async function flushAsync(): Promise<void> {
  // The fan-out is fired with `void promise`. Yield twice to let microtasks
  // settle (await fetch + await notificationLog.create).
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setImmediate(r));
  }
}

describe("POST /api/ratings — optional comment", () => {
  it("stores comment=null when omitted", async () => {
    const res = await callRoute(validBody);
    expect(res.status).toBe(200);
    expect(state.ratings).toHaveLength(1);
    expect(state.ratings[0].comment).toBeNull();
  });

  it("trims and stores a valid comment", async () => {
    const res = await callRoute({ ...validBody, comment: "  great rep, super responsive  " });
    expect(res.status).toBe(200);
    expect(state.ratings).toHaveLength(1);
    expect(state.ratings[0].comment).toBe("great rep, super responsive");
  });

  it("treats whitespace-only comment as null", async () => {
    const res = await callRoute({ ...validBody, comment: "    \n   " });
    expect(res.status).toBe(200);
    expect(state.ratings).toHaveLength(1);
    expect(state.ratings[0].comment).toBeNull();
  });

  it("400s when comment exceeds 500 chars", async () => {
    const res = await callRoute({ ...validBody, comment: "x".repeat(501) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/500/);
    expect(state.ratings).toHaveLength(0);
  });

  it("accepts a comment of exactly 500 chars", async () => {
    const res = await callRoute({ ...validBody, comment: "x".repeat(500) });
    expect(res.status).toBe(200);
    expect(state.ratings).toHaveLength(1);
    expect(state.ratings[0].comment).toHaveLength(500);
  });

  it("400s when comment is not a string", async () => {
    const res = await callRoute({ ...validBody, comment: 42 });
    expect(res.status).toBe(400);
    expect(state.ratings).toHaveLength(0);
  });
});

describe("POST /api/ratings — favorite notification fan-out", () => {
  it("creates a NotificationLog row for each Rater favoriting this Rep", async () => {
    state.favorites.push(
      { id: "fav-1", raterUserId: "watcher-1", repUserId: "rep-1", createdAt: new Date() },
      { id: "fav-2", raterUserId: "watcher-2", repUserId: "rep-1", createdAt: new Date() },
    );
    const res = await callRoute(validBody);
    expect(res.status).toBe(200);
    await flushAsync();
    expect(state.notificationLogs).toHaveLength(2);
    const recipients = state.notificationLogs.map((n) => n.userId).sort();
    expect(recipients).toEqual(["watcher-1", "watcher-2"]);
    for (const log of state.notificationLogs) {
      expect(log.kind).toBe("favorite-rating");
      const payload = JSON.parse(log.payload);
      expect(payload.repUserId).toBe("rep-1");
      expect(payload.repName).toBe("Diego");
      // Privacy: payload must NOT include the rater's identity.
      expect(JSON.stringify(payload)).not.toContain("rater-1");
    }
  });

  it("attempts an Expo push only when the watcher has push tokens", async () => {
    state.favorites.push(
      { id: "fav-1", raterUserId: "watcher-1", repUserId: "rep-1", createdAt: new Date() },
      { id: "fav-2", raterUserId: "watcher-2", repUserId: "rep-1", createdAt: new Date() },
    );
    const res = await callRoute(validBody);
    expect(res.status).toBe(200);
    await flushAsync();
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const pushCalls = fetchMock.mock.calls.filter(
      (c) => typeof c[0] === "string" && (c[0] as string).includes("exp.host"),
    );
    // watcher-1 has a token → 1 push call; watcher-2 has none → 0.
    expect(pushCalls).toHaveLength(1);
    const w1Log = state.notificationLogs.find((n) => n.userId === "watcher-1");
    const w2Log = state.notificationLogs.find((n) => n.userId === "watcher-2");
    expect(w1Log?.pushSent).toBe(true);
    expect(w2Log?.pushSent).toBe(false);
  });

  it("does NOT include the rater's identity in the push body (privacy)", async () => {
    state.favorites.push({
      id: "fav-1",
      raterUserId: "watcher-1",
      repUserId: "rep-1",
      createdAt: new Date(),
    });
    const res = await callRoute(validBody);
    expect(res.status).toBe(200);
    await flushAsync();
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const pushCall = fetchMock.mock.calls.find(
      (c) => typeof c[0] === "string" && (c[0] as string).includes("exp.host"),
    );
    expect(pushCall).toBeDefined();
    const reqInit = pushCall?.[1] as RequestInit | undefined;
    const body = typeof reqInit?.body === "string" ? reqInit.body : "";
    expect(body).toContain("Diego"); // rep IS named
    expect(body).not.toContain("rater-1"); // rater id is not
  });

  it("creates no logs when the rep has no favoriting raters", async () => {
    const res = await callRoute(validBody);
    expect(res.status).toBe(200);
    await flushAsync();
    expect(state.notificationLogs).toHaveLength(0);
  });

  it("still returns the rating successfully when fetch (push/email) throws", async () => {
    state.favorites.push({
      id: "fav-1",
      raterUserId: "watcher-1",
      repUserId: "rep-1",
      createdAt: new Date(),
    });
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const res = await callRoute(validBody);
    expect(res.status).toBe(200);
    await flushAsync();
    // Log row still written, but pushSent=false (fetch threw).
    expect(state.notificationLogs).toHaveLength(1);
    expect(state.notificationLogs[0].pushSent).toBe(false);
  });
});
