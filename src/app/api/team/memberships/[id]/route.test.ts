/**
 * Tests for PATCH /api/team/memberships/:id.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

process.env.AUTH_SECRET = "test-auth-secret-do-not-use-in-prod";

let mockSession: { user: { id: string; email: string; name: string; role: string } } | null = {
  user: { id: "rep-1", email: "rep1@x.com", name: "R", role: "REP" },
};

vi.mock("@/lib/auth", () => ({
  requireSession: vi.fn(async () => {
    if (!mockSession) throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    return mockSession;
  }),
  requireRole: vi.fn(async () => {
    throw new Error("requireRole should not be called by this route");
  }),
}));

type Row = {
  id: string;
  managerId: string;
  memberId: string;
  invitedAt: Date;
  acceptedAt: Date | null;
  endedAt: Date | null;
};

const table: { rows: Row[] } = { rows: [] };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    teamMembership: {
      findUnique: vi.fn(async (args: { where: { id: string } }) => {
        return table.rows.find((r) => r.id === args.where.id) ?? null;
      }),
      update: vi.fn(
        async (args: { where: { id: string }; data: Partial<Row> }) => {
          const r = table.rows.find((row) => row.id === args.where.id);
          if (!r) throw new Error("not found");
          Object.assign(r, args.data);
          return r;
        },
      ),
    },
  },
}));

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/team/memberships/x", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function callRoute(id: string, body: unknown): Promise<Response> {
  const mod = await import("./route");
  return mod.PATCH(makeRequest(body), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  mockSession = { user: { id: "rep-1", email: "rep1@x.com", name: "R", role: "REP" } };
  table.rows = [
    {
      id: "tm-pending",
      managerId: "mgr-1",
      memberId: "rep-1",
      invitedAt: new Date("2026-04-01"),
      acceptedAt: null,
      endedAt: null,
    },
    {
      id: "tm-active",
      managerId: "mgr-1",
      memberId: "rep-2",
      invitedAt: new Date("2026-04-01"),
      acceptedAt: new Date("2026-04-02"),
      endedAt: null,
    },
  ];
});

describe("PATCH /api/team/memberships/:id", () => {
  it("returns 401 when there is no session", async () => {
    mockSession = null;
    const res = await callRoute("tm-pending", { action: "accept" });
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid action", async () => {
    const res = await callRoute("tm-pending", { action: "stomp" });
    expect(res.status).toBe(400);
  });

  it("returns 400 on missing action", async () => {
    const res = await callRoute("tm-pending", {});
    expect(res.status).toBe(400);
  });

  it("returns 404 when membership doesn't exist", async () => {
    const res = await callRoute("tm-nope", { action: "accept" });
    expect(res.status).toBe(404);
  });

  it("returns 403 when caller isn't the member", async () => {
    mockSession = { user: { id: "stranger", email: "s@x.com", name: "S", role: "REP" } };
    const res = await callRoute("tm-pending", { action: "accept" });
    expect(res.status).toBe(403);
  });

  it("accept: pending → active, sets acceptedAt", async () => {
    const res = await callRoute("tm-pending", { action: "accept" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.membership.acceptedAt).not.toBeNull();
  });

  it("accept: returns 409 when already accepted", async () => {
    mockSession = { user: { id: "rep-2", email: "r@x.com", name: "R2", role: "REP" } };
    const res = await callRoute("tm-active", { action: "accept" });
    expect(res.status).toBe(409);
  });

  it("decline: pending → ended, sets endedAt, leaves acceptedAt null", async () => {
    const res = await callRoute("tm-pending", { action: "decline" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.membership.endedAt).not.toBeNull();
    expect(body.membership.acceptedAt).toBeNull();
  });

  it("decline: returns 409 when already accepted", async () => {
    mockSession = { user: { id: "rep-2", email: "r@x.com", name: "R2", role: "REP" } };
    const res = await callRoute("tm-active", { action: "decline" });
    expect(res.status).toBe(409);
  });

  it("leave: active → ended, sets endedAt", async () => {
    mockSession = { user: { id: "rep-2", email: "r@x.com", name: "R2", role: "REP" } };
    const res = await callRoute("tm-active", { action: "leave" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.membership.endedAt).not.toBeNull();
  });

  it("leave: returns 409 when not yet accepted", async () => {
    const res = await callRoute("tm-pending", { action: "leave" });
    expect(res.status).toBe(409);
  });

  it("leave: returns 409 when already ended", async () => {
    table.rows.push({
      id: "tm-ended",
      managerId: "mgr-1",
      memberId: "rep-1",
      invitedAt: new Date("2026-01-01"),
      acceptedAt: new Date("2026-01-02"),
      endedAt: new Date("2026-02-01"),
    });
    const res = await callRoute("tm-ended", { action: "leave" });
    expect(res.status).toBe(409);
  });
});
