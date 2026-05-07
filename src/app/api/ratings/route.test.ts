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

const state: {
  conns: ConnRow[];
  ratings: RatingRow[];
  ratingRequests: RRRow[];
  nextId: number;
} = { conns: [], ratings: [], ratingRequests: [], nextId: 1 };

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
  state.nextId = 1;
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
