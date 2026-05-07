/**
 * Tests for POST /api/me/avatar.
 *
 * Mocks: @/lib/auth (requireSession), @/lib/prisma (user.update),
 * @/lib/env (HAS_DB), and @/lib/storage (uploadAvatar). The storage
 * module is mocked rather than mocking fetch directly — keeps the route
 * test focused on validation + DB write behavior, while the underlying
 * fetch wiring is covered in storage.test.ts.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks (hoisted)
// ---------------------------------------------------------------------------

const envState = { HAS_DB: true };
vi.mock("@/lib/env", () => ({
  get HAS_DB() {
    return envState.HAS_DB;
  },
}));

let mockSession:
  | { user: { id: string; email: string; name: string; role: string } }
  | null = {
  user: { id: "user-1", email: "u@x.com", name: "U", role: "REP" },
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

interface UpdateCall {
  where: { id: string };
  data: { avatarUrl: string };
}
const updateCalls: UpdateCall[] = [];
const userRows: Record<string, { id: string; avatarUrl: string | null }> = {};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      update: vi.fn(async (args: UpdateCall) => {
        updateCalls.push(args);
        const row = userRows[args.where.id] ?? {
          id: args.where.id,
          avatarUrl: null,
        };
        row.avatarUrl = args.data.avatarUrl;
        userRows[args.where.id] = row;
        return row;
      }),
    },
  },
}));

const storageState: {
  result: { publicUrl: string; path: string } | { error: string; missingConfig?: boolean };
} = {
  result: {
    publicUrl: "https://example.supabase.co/storage/v1/object/public/avatars/x",
    path: "x",
  },
};

vi.mock("@/lib/storage", async () => {
  const real = (await vi.importActual<typeof import("@/lib/storage")>(
    "@/lib/storage",
  ));
  return {
    ...real,
    uploadAvatar: vi.fn(async () => storageState.result),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: FormData | null): Request {
  const init: RequestInit = { method: "POST" };
  if (body) init.body = body;
  return new Request("http://localhost/api/me/avatar", init);
}

function makeFile(bytes: number, mime: string): File {
  const buf = new Uint8Array(bytes);
  return new File([buf], "avatar.png", { type: mime });
}

async function callRoute(form: FormData | null): Promise<Response> {
  const mod = await import("./route");
  return mod.POST(makeRequest(form));
}

beforeEach(() => {
  envState.HAS_DB = true;
  mockSession = { user: { id: "user-1", email: "u@x.com", name: "U", role: "REP" } };
  updateCalls.length = 0;
  for (const k of Object.keys(userRows)) delete userRows[k];
  storageState.result = {
    publicUrl: "https://example.supabase.co/storage/v1/object/public/avatars/users/user-1/abc.png",
    path: "users/user-1/abc.png",
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/me/avatar", () => {
  it("returns 401 when there is no session", async () => {
    mockSession = null;
    const fd = new FormData();
    fd.append("file", makeFile(10, "image/png"));
    const res = await callRoute(fd);
    expect(res.status).toBe(401);
  });

  it("returns 503 in mock mode (HAS_DB=false)", async () => {
    envState.HAS_DB = false;
    const fd = new FormData();
    fd.append("file", makeFile(10, "image/png"));
    const res = await callRoute(fd);
    expect(res.status).toBe(503);
  });

  it("returns 400 when no file is present", async () => {
    const fd = new FormData();
    const res = await callRoute(fd);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/file/i);
  });

  it("returns 400 for an empty file", async () => {
    const fd = new FormData();
    fd.append("file", makeFile(0, "image/png"));
    const res = await callRoute(fd);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/empty/i);
  });

  it("returns 400 when file exceeds 2MB", async () => {
    const fd = new FormData();
    fd.append("file", makeFile(2 * 1024 * 1024 + 1, "image/png"));
    const res = await callRoute(fd);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/2MB/);
  });

  it("returns 400 for an unsupported content-type", async () => {
    const fd = new FormData();
    fd.append("file", makeFile(10, "image/gif"));
    const res = await callRoute(fd);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/content-type/i);
  });

  it("uploads + writes avatarUrl on success (image/png)", async () => {
    const fd = new FormData();
    fd.append("file", makeFile(50, "image/png"));
    const res = await callRoute(fd);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.avatarUrl).toMatch(/^https:\/\//);
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0].where.id).toBe("user-1");
    expect(updateCalls[0].data.avatarUrl).toBe(body.avatarUrl);
  });

  it("accepts image/jpeg and image/webp", async () => {
    for (const mime of ["image/jpeg", "image/webp"]) {
      updateCalls.length = 0;
      const fd = new FormData();
      fd.append("file", makeFile(50, mime));
      const res = await callRoute(fd);
      expect(res.status).toBe(200);
      expect(updateCalls.length).toBe(1);
    }
  });

  it("returns 503 when storage env config is missing (soft-fail)", async () => {
    storageState.result = {
      error: "Avatar upload is not configured.",
      missingConfig: true,
    };
    const fd = new FormData();
    fd.append("file", makeFile(50, "image/png"));
    const res = await callRoute(fd);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/not configured/i);
    expect(updateCalls.length).toBe(0);
  });

  it("returns 502 when storage upload fails for non-config reasons", async () => {
    storageState.result = { error: "Upload failed (404): Bucket not found" };
    const fd = new FormData();
    fd.append("file", makeFile(50, "image/png"));
    const res = await callRoute(fd);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/Bucket not found/);
    expect(updateCalls.length).toBe(0);
  });
});
