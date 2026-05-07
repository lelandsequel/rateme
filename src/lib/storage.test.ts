/**
 * Tests for src/lib/storage.ts.
 *
 * We mock global.fetch and toggle SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 * env vars to cover both the happy path and the "missing config" soft-fail.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { extensionForMime, uploadAvatar } from "./storage";

const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe("extensionForMime", () => {
  it("maps the allow-listed mimes to extensions", () => {
    expect(extensionForMime("image/png")).toBe("png");
    expect(extensionForMime("image/jpeg")).toBe("jpg");
    expect(extensionForMime("image/webp")).toBe("webp");
  });

  it("returns null for unsupported mimes", () => {
    expect(extensionForMime("image/gif")).toBeNull();
    expect(extensionForMime("application/pdf")).toBeNull();
    expect(extensionForMime("")).toBeNull();
  });
});

describe("uploadAvatar", () => {
  it("returns a missing-config error when SUPABASE_URL is unset", async () => {
    delete process.env.SUPABASE_URL;
    const out = await uploadAvatar(
      "users/u/abc.png",
      new Uint8Array([1, 2, 3]),
      "image/png",
    );
    expect("error" in out).toBe(true);
    if ("error" in out) {
      expect(out.missingConfig).toBe(true);
      expect(out.error).toMatch(/not configured/i);
    }
  });

  it("returns a missing-config error when SERVICE_ROLE_KEY is unset", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const out = await uploadAvatar(
      "users/u/abc.png",
      new Uint8Array([1, 2, 3]),
      "image/png",
    );
    expect("error" in out).toBe(true);
    if ("error" in out) {
      expect(out.missingConfig).toBe(true);
    }
  });

  it("posts to the correct endpoint with auth + content-type and returns the public URL", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const buf = new Uint8Array([1, 2, 3, 4]);
    const out = await uploadAvatar("users/user-1/abc.png", buf, "image/png");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://example.supabase.co/storage/v1/object/avatars/users/user-1/abc.png",
    );
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer service-role-test");
    expect(headers["Content-Type"]).toBe("image/png");
    expect(headers["x-upsert"]).toBe("true");
    expect(init.body).toBe(buf);

    expect("error" in out).toBe(false);
    if (!("error" in out)) {
      expect(out.path).toBe("users/user-1/abc.png");
      expect(out.publicUrl).toBe(
        "https://example.supabase.co/storage/v1/object/public/avatars/users/user-1/abc.png",
      );
    }
  });

  it("returns an error when Supabase returns a non-OK response", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "Bucket not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const out = await uploadAvatar(
      "users/u/abc.png",
      new Uint8Array([1]),
      "image/png",
    );
    expect("error" in out).toBe(true);
    if ("error" in out) {
      expect(out.missingConfig).toBeUndefined();
      expect(out.error).toMatch(/404/);
      expect(out.error).toMatch(/Bucket not found/);
    }
  });

  it("handles non-JSON error bodies gracefully", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("not json", {
          status: 500,
          headers: { "Content-Type": "text/plain" },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const out = await uploadAvatar(
      "users/u/abc.png",
      new Uint8Array([1]),
      "image/png",
    );
    expect("error" in out).toBe(true);
    if ("error" in out) {
      expect(out.error).toMatch(/500/);
    }
  });
});
