/**
 * Tests for POST /api/rating-requests/one-time.
 *
 * Mirrors the lightweight pattern in
 * src/app/api/notifications/register/route.test.ts — we hand-roll an
 * in-memory prisma fake exposing only the surface this route uses.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockSession:
  | { user: { id: string; role: string; email?: string; name?: string } }
  | null = { user: { id: "rep-1", role: "REP" } };

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

interface UserRow {
  id: string;
  email: string;
  role: "REP" | "RATER" | "SALES_MANAGER" | "RATER_MANAGER" | "ADMIN";
  hasRepProfile?: boolean;
}

interface ConnRow {
  id: string;
  repUserId: string;
  raterUserId: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "DISCONNECTED";
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
  users: UserRow[];
  conns: ConnRow[];
  ratingRequests: RRRow[];
  nextId: number;
} = { users: [], conns: [], ratingRequests: [], nextId: 1 };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async (args: { where: { id?: string; email?: string }; include?: { repProfile?: boolean }; select?: Record<string, boolean> }) => {
        const u = state.users.find(
          (r) =>
            (args.where.id && r.id === args.where.id) ||
            (args.where.email && r.email === args.where.email),
        );
        if (!u) return null;
        if (args.include?.repProfile) {
          return { ...u, repProfile: u.hasRepProfile ? { userId: u.id } : null };
        }
        return u;
      }),
    },
    connection: {
      findUnique: vi.fn(async (args: { where: { repUserId_raterUserId?: { repUserId: string; raterUserId: string } } }) => {
        const k = args.where.repUserId_raterUserId;
        if (!k) return null;
        return (
          state.conns.find(
            (c) => c.repUserId === k.repUserId && c.raterUserId === k.raterUserId,
          ) ?? null
        );
      }),
    },
    ratingRequest: {
      findFirst: vi.fn(
        async (args: {
          where: {
            type?: string;
            forRepUserId?: string;
            toEmail?: string;
            createdAt?: { gte?: Date };
            status?: { not?: string };
          };
        }) => {
          const w = args.where;
          return (
            state.ratingRequests.find((r) => {
              if (w.type && r.type !== w.type) return false;
              if (w.forRepUserId && r.forRepUserId !== w.forRepUserId) return false;
              if (w.toEmail && r.toEmail !== w.toEmail) return false;
              if (w.createdAt?.gte && r.createdAt < w.createdAt.gte) return false;
              if (w.status?.not && r.status === w.status.not) return false;
              return true;
            }) ?? null
          );
        },
      ),
      create: vi.fn(async (args: { data: Omit<RRRow, "id" | "createdAt" | "completedAt"> & { createdAt?: Date } }) => {
        const row: RRRow = {
          id: `rr-${state.nextId++}`,
          createdAt: args.data.createdAt ?? new Date(),
          completedAt: null,
          ...args.data,
        };
        state.ratingRequests.push(row);
        return row;
      }),
    },
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/rating-requests/one-time", {
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
  mockSession = { user: { id: "rep-1", role: "REP" } };
  state.users = [
    { id: "rep-1", email: "rep@example.com", role: "REP", hasRepProfile: true },
  ];
  state.conns = [];
  state.ratingRequests = [];
  state.nextId = 1;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/rating-requests/one-time", () => {
  it("403s a non-REP caller", async () => {
    mockSession = { user: { id: "u-1", role: "RATER" } };
    const res = await callRoute({ toEmail: "x@y.com" });
    expect(res.status).toBe(403);
  });

  it("400s an invalid email", async () => {
    const res = await callRoute({ toEmail: "not-an-email" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/email/i);
  });

  it("400s when the rep has no repProfile", async () => {
    state.users = [
      { id: "rep-1", email: "rep@example.com", role: "REP", hasRepProfile: false },
    ];
    const res = await callRoute({ toEmail: "x@y.com" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/profile/i);
  });

  it("400s when target email already has an ACCEPTED connection with this rep", async () => {
    state.users.push({ id: "rater-1", email: "rater@example.com", role: "RATER" });
    state.conns.push({
      id: "c-1",
      repUserId: "rep-1",
      raterUserId: "rater-1",
      status: "ACCEPTED",
    });
    const res = await callRoute({ toEmail: "rater@example.com" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/already connected/i);
  });

  it("allows when an existing user has only a PENDING (not accepted) connection", async () => {
    state.users.push({ id: "rater-1", email: "rater@example.com", role: "RATER" });
    state.conns.push({
      id: "c-1",
      repUserId: "rep-1",
      raterUserId: "rater-1",
      status: "PENDING",
    });
    const res = await callRoute({ toEmail: "rater@example.com" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toMatch(/^rr-/);
    expect(body.inviteUrl).toBe(`/rate/${body.id}`);
  });

  it("429s a duplicate ONE_TIME within 7 days", async () => {
    state.ratingRequests.push({
      id: "rr-existing",
      type: "ONE_TIME",
      status: "PENDING",
      forRepUserId: "rep-1",
      initiatedByUserId: "rep-1",
      toEmail: "fresh@example.com",
      toRaterUserId: null,
      createdAt: new Date(Date.now() - 1000),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      completedAt: null,
    });
    const res = await callRoute({ toEmail: "fresh@example.com" });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/last 7 days/i);
  });

  it("creates a PENDING ONE_TIME request and returns inviteUrl", async () => {
    const res = await callRoute({ toEmail: "BRAND@new.com" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("rr-1");
    expect(body.inviteUrl).toBe("/rate/rr-1");
    expect(state.ratingRequests).toHaveLength(1);
    expect(state.ratingRequests[0].toEmail).toBe("brand@new.com");
    expect(state.ratingRequests[0].forRepUserId).toBe("rep-1");
    expect(state.ratingRequests[0].type).toBe("ONE_TIME");
  });
});
