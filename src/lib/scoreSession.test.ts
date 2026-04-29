import { describe, it, expect } from "vitest";
import { scoreSession } from "./quasar";

const NOW = new Date("2026-04-27T15:00:00");

describe("scoreSession", () => {
  it("scores a high-engagement DEMO during business hours highly", () => {
    const startedAt = new Date(NOW);
    startedAt.setHours(11, 0, 0, 0);
    const endedAt = new Date(startedAt.getTime() + 30 * 60_000); // 30 min
    const result = scoreSession(
      { startedAt, endedAt, sentiment: 0.85, type: "DEMO" },
      { hireDate: new Date("2024-01-01") },
      NOW,
    );
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.flags).toContain("high-engagement");
    expect(result.band === "thriving" || result.band === "steady").toBe(true);
  });

  it("flags low-sentiment + early-wake on a 6am call with bad sentiment", () => {
    const startedAt = new Date(NOW);
    startedAt.setHours(6, 30, 0, 0);
    const endedAt = new Date(startedAt.getTime() + 30 * 60_000);
    const result = scoreSession(
      { startedAt, endedAt, sentiment: 0.25, type: "CALL" },
      { hireDate: new Date("2024-01-01") },
      NOW,
    );
    expect(result.flags).toContain("low-sentiment");
    expect(result.flags).toContain("early-wake");
    // Low sentiment dominates the 50% weight; should land in watch / at-risk
    expect(result.band === "watch" || result.band === "at-risk").toBe(true);
  });

  it("flags long-duration on a 90-minute meeting", () => {
    const startedAt = new Date(NOW);
    startedAt.setHours(13, 0, 0, 0);
    const endedAt = new Date(startedAt.getTime() + 90 * 60_000); // 90 min
    const result = scoreSession(
      { startedAt, endedAt, sentiment: 0.6, type: "MEETING" },
      { hireDate: new Date("2024-01-01") },
      NOW,
    );
    expect(result.flags).toContain("long-duration");
    // Score should still be a reasonable integer in range.
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("handles missing endedAt + missing sentiment gracefully", () => {
    const startedAt = new Date(NOW);
    startedAt.setHours(14, 0, 0, 0);
    const result = scoreSession(
      { startedAt, sentiment: null, type: "CALL" },
      { hireDate: new Date("2024-01-01") },
      NOW,
    );
    // No flags emitted for sentiment when null
    expect(result.flags).not.toContain("low-sentiment");
    expect(result.flags).not.toContain("high-engagement");
    // Still produces a numeric score in range
    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
