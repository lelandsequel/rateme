import { describe, it, expect } from "vitest";
import { rankReps } from "./leaderboard";

describe("rankReps — leaderboard math", () => {
  it("assigns 1-indexed ranks in score-desc order", () => {
    const ranked = rankReps([
      { id: "a", name: "A", teamName: "T1", latestScore: 70, latestConfidence: 0.8, previousScore: 70 },
      { id: "b", name: "B", teamName: "T1", latestScore: 95, latestConfidence: 0.9, previousScore: 90 },
      { id: "c", name: "C", teamName: "T1", latestScore: 80, latestConfidence: 0.85, previousScore: 80 },
    ]);
    expect(ranked.map((r) => [r.repId, r.rank])).toEqual([
      ["b", 1],
      ["c", 2],
      ["a", 3],
    ]);
  });

  it("ties share rank, next slot skips", () => {
    // Two reps at 90 → both rank 1; next at 85 → rank 3.
    const ranked = rankReps([
      { id: "a", name: "Alpha", teamName: "T", latestScore: 90, latestConfidence: 0.8, previousScore: null },
      { id: "b", name: "Bravo", teamName: "T", latestScore: 90, latestConfidence: 0.8, previousScore: null },
      { id: "c", name: "Charlie", teamName: "T", latestScore: 85, latestConfidence: 0.8, previousScore: null },
      { id: "d", name: "Delta", teamName: "T", latestScore: 85, latestConfidence: 0.8, previousScore: null },
      { id: "e", name: "Echo", teamName: "T", latestScore: 70, latestConfidence: 0.8, previousScore: null },
    ]);
    const ranks = Object.fromEntries(ranked.map((r) => [r.repId, r.rank]));
    expect(ranks.a).toBe(1);
    expect(ranks.b).toBe(1);
    expect(ranks.c).toBe(3);
    expect(ranks.d).toBe(3);
    expect(ranks.e).toBe(5);
  });

  it("computes percentile per spec: 100 * (total - rank + 1) / total", () => {
    const ranked = rankReps([
      { id: "a", name: "A", teamName: "T", latestScore: 90, latestConfidence: 0.8, previousScore: null },
      { id: "b", name: "B", teamName: "T", latestScore: 80, latestConfidence: 0.8, previousScore: null },
      { id: "c", name: "C", teamName: "T", latestScore: 70, latestConfidence: 0.8, previousScore: null },
      { id: "d", name: "D", teamName: "T", latestScore: 60, latestConfidence: 0.8, previousScore: null },
    ]);
    const pct = Object.fromEntries(ranked.map((r) => [r.repId, r.percentile]));
    // total=4, rank=1 → 100; rank=2 → 75; rank=3 → 50; rank=4 → 25
    expect(pct.a).toBe(100);
    expect(pct.b).toBe(75);
    expect(pct.c).toBe(50);
    expect(pct.d).toBe(25);
  });

  it("derives trend from previous score", () => {
    const ranked = rankReps([
      { id: "up",   name: "Up",   teamName: "T", latestScore: 80, latestConfidence: 0.8, previousScore: 70 },
      { id: "flat", name: "Flat", teamName: "T", latestScore: 75, latestConfidence: 0.8, previousScore: 75 },
      { id: "down", name: "Down", teamName: "T", latestScore: 60, latestConfidence: 0.8, previousScore: 90 },
      { id: "new",  name: "New",  teamName: "T", latestScore: 65, latestConfidence: 0.8, previousScore: null },
    ]);
    const trend = Object.fromEntries(ranked.map((r) => [r.repId, r.trend]));
    expect(trend.up).toBe("up");
    expect(trend.flat).toBe("flat");
    expect(trend.down).toBe("down");
    // No prior score → "flat" by spec (most conservative).
    expect(trend.new).toBe("flat");
  });

  it("derives band from score using same thresholds as rep scoring", () => {
    const ranked = rankReps([
      { id: "thr", name: "T", teamName: "T", latestScore: 92, latestConfidence: 0.8, previousScore: null },
      { id: "std", name: "S", teamName: "T", latestScore: 80, latestConfidence: 0.8, previousScore: null },
      { id: "wat", name: "W", teamName: "T", latestScore: 65, latestConfidence: 0.8, previousScore: null },
      { id: "atr", name: "A", teamName: "T", latestScore: 40, latestConfidence: 0.8, previousScore: null },
    ]);
    const bands = Object.fromEntries(ranked.map((r) => [r.repId, r.band]));
    expect(bands.thr).toBe("thriving");
    expect(bands.std).toBe("steady");
    expect(bands.wat).toBe("watch");
    expect(bands.atr).toBe("at-risk");
  });

  it("returns empty array on empty input", () => {
    expect(rankReps([])).toEqual([]);
  });
});
