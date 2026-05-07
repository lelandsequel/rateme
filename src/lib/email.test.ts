/**
 * Tests for sendEmail wrapper.
 *
 * Stub mode is the path the cron job hits in dev/staging without keys.
 * Resend mode is exercised via a stubbed global fetch — we don't install
 * the resend SDK and we don't actually hit the network.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { sendEmail } from "./email";

describe("sendEmail", () => {
  const origKey = process.env.RESEND_API_KEY;
  const origFrom = process.env.RESEND_FROM_EMAIL;

  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (origKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = origKey;
    if (origFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = origFrom;
  });

  it("falls back to stub mode when RESEND_API_KEY is unset", async () => {
    const res = await sendEmail({
      to: "rep@example.com",
      subject: "Hi",
      html: "<p>hi</p>",
      text: "hi",
    });
    expect(res).toEqual({ ok: true, provider: "stub" });
  });

  it("logs a one-line summary in stub mode", async () => {
    const logSpy = vi
      .spyOn(console, "log")
      .mockImplementation(() => {});
    await sendEmail({
      to: "rep@example.com",
      subject: "Subj",
      html: "h",
      text: "t",
    });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const arg = logSpy.mock.calls[0][0] as string;
    expect(arg).toContain("[email-stub]");
    expect(arg).toContain("to=rep@example.com");
    expect(arg).toContain("subject=Subj");
  });

  it("calls Resend API when RESEND_API_KEY is set and returns id", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM_EMAIL = "Test <test@example.com>";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "rsnd_abc" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const res = await sendEmail({
      to: "user@x.com",
      subject: "S",
      html: "<p>h</p>",
      text: "t",
    });

    expect(res).toEqual({ ok: true, provider: "resend", id: "rsnd_abc" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-key");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.from).toBe("Test <test@example.com>");
    expect(body.to).toBe("user@x.com");
    expect(body.subject).toBe("S");
  });

  it("returns ok:false on non-2xx Resend response", async () => {
    process.env.RESEND_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rate limit", { status: 429 }),
    );

    const res = await sendEmail({
      to: "user@x.com",
      subject: "S",
      html: "h",
      text: "t",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/429/);
    }
  });

  it("returns ok:false on network failure (does not throw)", async () => {
    process.env.RESEND_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await sendEmail({
      to: "user@x.com",
      subject: "S",
      html: "h",
      text: "t",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/ECONNREFUSED/);
    }
  });
});
