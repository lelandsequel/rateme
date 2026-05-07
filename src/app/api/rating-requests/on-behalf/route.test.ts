/**
 * Tests for POST /api/rating-requests/on-behalf.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

let mockSession:
  | { user: { id: string; role: string; email?: string; name?: string } }
  | null = { user: { id: "mgr-1", role: "SALES_MANAGER" } };

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

interface MembershipRow {
  id: string;
  managerId: string;
  memberId: string;
  acceptedAt: Date | null;
  endedAt: Date | null;
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
  memberships: MembershipRow[];
  conns: ConnRow[];
  ratingRequests: RRRow[];
  nextId: number;
} = { memberships: [], conns: [], ratingRequests: [], nextId: 1 };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    teamMembership: {
      findFirst: vi.fn(
        async (args: {
          where: {
            managerId?: string;
            memberId?: string;
            acceptedAt?: { not: null };
            endedAt?: null;
          };
        }) => {
          const w = args.where;
          return (
            state.memberships.find((m) => {
              if (w.managerId && m.managerId !== w.managerId) return false;
              if (w.memberId && m.memberId !== w.memberId) return false;
              if (w.acceptedAt && m.acceptedAt === null) return false;
              if (w.endedAt === null && m.endedAt !== null) return false;
              return true;
            }) ?? null
          );
        },
      ),
    },
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
    ratingRequest: {
      findFirst: vi.fn(
        async (args: {
          where: {
            type?: string;
            forRepUserId?: string;
            toRaterUserId?: string;
            createdAt?: { gte?: Date };
          };
        }) => {
          const w = args.where;
          return (
            state.ratingRequests.find((r) => {
              if (w.type && r.type !== w.type) return false;
              if (w.forRepUserId && r.forRepUserId !== w.forRepUserId) return false;
              if (w.toRaterUserId && r.toRaterUserId !== w.toRaterUserId) return false;
              if (w.createdAt?.gte && r.createdAt < w.createdAt.gte) return false;
              return true;
            }) ?? null
          );
        },
      ),
      create: vi.fn(
        async (args: {
          data: Omit<RRRow, "id" | "createdAt" | "completedAt"> & {
            createdAt?: Date;
          };
        }) => {
          const row: RRRow = {
            id: `rr-${state.nextId++}`,
            createdAt: args.data.createdAt ?? new Date(),
            completedAt: null,
            ...args.data,
          };
          state.ratingRequests.push(row);
          return row;
        },
      ),
    },
  },
}));

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/rating-requests/on-behalf", {
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
  mockSession = { user: { id: "mgr-1", role: "SALES_MANAGER" } };
  state.memberships = [
    {
      id: "tm-1",
      managerId: "mgr-1",
      memberId: "rep-1",
      acceptedAt: new Date("2026-01-01"),
      endedAt: null,
    },
  ];
  state.conns = [
    {
      id: "c-1",
      repUserId: "rep-1",
      raterUserId: "rater-1",
      status: "ACCEPTED",
    },
  ];
  state.ratingRequests = [];
  state.nextId = 1;
});

describe("POST /api/rating-requests/on-behalf", () => {
  it("403s a non-manager", async () => {
    mockSession = { user: { id: "rep-1", role: "REP" } };
    const res = await callRoute({ forRepUserId: "rep-1", toRaterUserId: "rater-1" });
    expect(res.status).toBe(403);
  });

  it("400s missing fields", async () => {
    const res = await callRoute({ forRepUserId: "rep-1" });
    expect(res.status).toBe(400);
  });

  it("403s when rep is not on the manager's team", async () => {
    state.memberships = [];
    const res = await callRoute({ forRepUserId: "rep-1", toRaterUserId: "rater-1" });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/team/i);
  });

  it("403s when membership exists but never accepted", async () => {
    state.memberships = [
      {
        id: "tm-1",
        managerId: "mgr-1",
        memberId: "rep-1",
        acceptedAt: null,
        endedAt: null,
      },
    ];
    const res = await callRoute({ forRepUserId: "rep-1", toRaterUserId: "rater-1" });
    expect(res.status).toBe(403);
  });

  it("400s when no ACCEPTED connection between (rep, rater)", async () => {
    state.conns[0].status = "PENDING";
    const res = await callRoute({ forRepUserId: "rep-1", toRaterUserId: "rater-1" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/connection/i);
  });

  it("429s when an ON_BEHALF request was made for the same pair within 30 days", async () => {
    state.ratingRequests.push({
      id: "rr-prev",
      type: "ON_BEHALF",
      status: "PENDING",
      forRepUserId: "rep-1",
      initiatedByUserId: "mgr-1",
      toEmail: null,
      toRaterUserId: "rater-1",
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      completedAt: null,
    });
    const res = await callRoute({ forRepUserId: "rep-1", toRaterUserId: "rater-1" });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.retryAfterDays).toBeGreaterThan(0);
    expect(body.retryAfterDays).toBeLessThanOrEqual(30);
  });

  it("creates a PENDING ON_BEHALF request when all checks pass", async () => {
    const res = await callRoute({ forRepUserId: "rep-1", toRaterUserId: "rater-1" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("rr-1");
    expect(state.ratingRequests).toHaveLength(1);
    expect(state.ratingRequests[0].type).toBe("ON_BEHALF");
    expect(state.ratingRequests[0].forRepUserId).toBe("rep-1");
    expect(state.ratingRequests[0].toRaterUserId).toBe("rater-1");
  });
});
