/**
 * Tests for PATCH /api/me/locale.
 *
 * Mocks @/lib/auth + @/lib/prisma + @/lib/env in the canonical pattern.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const envState = { HAS_DB: true };
vi.mock("@/lib/env", () => ({
  get HAS_DB() {
    return envState.HAS_DB;
  },
}));

let mockSession:
  | { user: { id: string; email: string; name: string; role: string } }
  | null = {
  user: { id: "user-1", email: "u@x.com", name: "U", role: "RATER" },
};

vi.mock("@/lib/auth", () => ({
  requireSession: vi.fn(async () => {
    if (!mockSession) {
      throw new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    return mockSession;
  }),
}));

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  state: string;
  avatarUrl: string | null;
  locale: string;
  createdAt: Date;
  repProfile?: unknown;
  raterProfile?: unknown;
  managerProfile?: unknown;
}

const users: Record<string, UserRow> = {};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async (args: { where: { id: string } }) => users[args.where.id] ?? null),
      update: vi.fn(async (args: { where: { id: string }; data: { locale?: string } }) => {
        const u = users[args.where.id];
        if (!u) throw new Error("not found");
        if (args.data.locale !== undefined) u.locale = args.data.locale;
        return u;
      }),
    },
  },
}));

async function callPatch(body: unknown): Promise<Response> {
  const mod = await import("./route");
  const req = new Request("http://localhost/api/me/locale", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return mod.PATCH(req);
}

beforeEach(() => {
  envState.HAS_DB = true;
  for (const k of Object.keys(users)) delete users[k];
  users["user-1"] = {
    id: "user-1",
    email: "u@x.com",
    name: "U",
    role: "RATER",
    state: "TX",
    avatarUrl: null,
    locale: "en",
    createdAt: new Date("2026-01-01"),
    repProfile: null,
    raterProfile: null,
    managerProfile: null,
  };
  mockSession = { user: { id: "user-1", email: "u@x.com", name: "U", role: "RATER" } };
});

describe("PATCH /api/me/locale", () => {
  it("returns 401 when not authenticated", async () => {
    mockSession = null;
    const res = await callPatch({ locale: "es" });
    expect(res.status).toBe(401);
  });

  it("returns 503 when HAS_DB is false (mock mode)", async () => {
    envState.HAS_DB = false;
    const res = await callPatch({ locale: "es" });
    expect(res.status).toBe(503);
  });

  it("returns 400 for invalid JSON body", async () => {
    const mod = await import("./route");
    const req = new Request("http://localhost/api/me/locale", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    const res = await mod.PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unsupported locale", async () => {
    const res = await callPatch({ locale: "fr" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/locale/i);
  });

  it("returns 400 when locale is missing", async () => {
    const res = await callPatch({});
    expect(res.status).toBe(400);
  });

  it("updates locale to es", async () => {
    const res = await callPatch({ locale: "es" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.locale).toBe("es");
    expect(users["user-1"].locale).toBe("es");
  });

  it("updates locale to pt", async () => {
    const res = await callPatch({ locale: "pt" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.locale).toBe("pt");
  });

  it("updates locale back to en", async () => {
    users["user-1"].locale = "es";
    const res = await callPatch({ locale: "en" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.locale).toBe("en");
  });
});
