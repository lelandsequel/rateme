/**
 * Tests for the training recommendation engine.
 *
 * Coverage targets:
 *   - empty input → no recs
 *   - all-5s → no recs (everything above the 4.0 ceiling)
 *   - mixed weak dimensions → recs sorted ascending by mean, 90-day filter
 *   - fewer than 3 ratings in window → filtered out entirely
 *   - cap at 3 — even if 4+ dims would qualify
 *   - severity buckets honor the spec thresholds
 */

import { describe, it, expect } from "vitest";
import { recommendTraining } from "./training-recs";

const NOW = new Date("2026-04-29T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

interface DimsOverride {
  responsiveness?: number;
  productKnowledge?: number;
  followThrough?: number;
  listeningNeedsFit?: number;
  trustIntegrity?: number;
  daysAgo?: number;
}

function r(over: DimsOverride = {}) {
  return {
    responsiveness: over.responsiveness ?? 5,
    productKnowledge: over.productKnowledge ?? 5,
    followThrough: over.followThrough ?? 5,
    listeningNeedsFit: over.listeningNeedsFit ?? 5,
    trustIntegrity: over.trustIntegrity ?? 5,
    createdAt: new Date(NOW.getTime() - (over.daysAgo ?? 1) * DAY),
  };
}

describe("recommendTraining", () => {
  it("returns empty when there are no ratings", () => {
    expect(recommendTraining([], NOW)).toEqual([]);
  });

  it("returns empty when every dimension averages 5.0 (above the 4.0 ceiling)", () => {
    const ratings = [r(), r(), r(), r()];
    expect(recommendTraining(ratings, NOW)).toEqual([]);
  });

  it("returns empty when fewer than 3 ratings fall in the 90-day window", () => {
    // Two recent low-scoring, the rest stale. Gate is on count, not score.
    const ratings = [
      r({ responsiveness: 1, productKnowledge: 1, followThrough: 1, listeningNeedsFit: 1, trustIntegrity: 1, daysAgo: 1 }),
      r({ responsiveness: 1, productKnowledge: 1, followThrough: 1, listeningNeedsFit: 1, trustIntegrity: 1, daysAgo: 2 }),
      r({ responsiveness: 1, daysAgo: 200 }),
      r({ responsiveness: 1, daysAgo: 365 }),
    ];
    expect(recommendTraining(ratings, NOW)).toEqual([]);
  });

  it("flags weak dimensions and sorts ascending by mean", () => {
    // 4 recent ratings:
    //   responsiveness avg = (2+2+2+2)/4 = 2.0  (low severity)
    //   productKnowledge avg = (3+3+3+3)/4 = 3.0 (medium)
    //   followThrough avg    = (4+4+4+4)/4 = 4.0 → at ceiling, EXCLUDED
    //   listeningNeedsFit avg= (5+5+5+5)/4 = 5.0 → EXCLUDED
    //   trustIntegrity avg   = (3.6 stub via mix below)
    const ratings = [
      r({ responsiveness: 2, productKnowledge: 3, followThrough: 4, listeningNeedsFit: 5, trustIntegrity: 4, daysAgo: 5 }),
      r({ responsiveness: 2, productKnowledge: 3, followThrough: 4, listeningNeedsFit: 5, trustIntegrity: 4, daysAgo: 10 }),
      r({ responsiveness: 2, productKnowledge: 3, followThrough: 4, listeningNeedsFit: 5, trustIntegrity: 3, daysAgo: 20 }),
      r({ responsiveness: 2, productKnowledge: 3, followThrough: 4, listeningNeedsFit: 5, trustIntegrity: 3, daysAgo: 40 }),
    ];
    const recs = recommendTraining(ratings, NOW);
    // Three qualifying dims: responsiveness (2.0), productKnowledge (3.0), trustIntegrity (3.5)
    expect(recs.map((x) => x.dimension)).toEqual([
      "responsiveness",
      "productKnowledge",
      "trustIntegrity",
    ]);
    expect(recs[0].averageScore).toBe(2.0);
    expect(recs[0].severity).toBe("low");
    expect(recs[1].averageScore).toBe(3.0);
    expect(recs[1].severity).toBe("medium");
    expect(recs[2].averageScore).toBe(3.5);
    expect(recs[2].severity).toBe("high");
    // Each rec carries non-empty content.
    for (const rec of recs) {
      expect(rec.suggestion.length).toBeGreaterThan(20);
      expect(rec.resources.length).toBeGreaterThanOrEqual(1);
      expect(rec.ratingsConsidered).toBe(4);
    }
  });

  it("caps at 3 recommendations even when 4+ dimensions qualify", () => {
    // Every dim averages 2.0 → all five would qualify.
    const ratings = [
      r({ responsiveness: 2, productKnowledge: 2, followThrough: 2, listeningNeedsFit: 2, trustIntegrity: 2, daysAgo: 1 }),
      r({ responsiveness: 2, productKnowledge: 2, followThrough: 2, listeningNeedsFit: 2, trustIntegrity: 2, daysAgo: 2 }),
      r({ responsiveness: 2, productKnowledge: 2, followThrough: 2, listeningNeedsFit: 2, trustIntegrity: 2, daysAgo: 3 }),
    ];
    const recs = recommendTraining(ratings, NOW);
    expect(recs.length).toBe(3);
  });

  it("excludes ratings older than 90 days from the average", () => {
    // 3 recent perfect ratings + 3 ancient terrible ratings → averages high.
    const ratings = [
      r({ responsiveness: 5, daysAgo: 1 }),
      r({ responsiveness: 5, daysAgo: 2 }),
      r({ responsiveness: 5, daysAgo: 3 }),
      r({ responsiveness: 1, daysAgo: 100 }),
      r({ responsiveness: 1, daysAgo: 120 }),
      r({ responsiveness: 1, daysAgo: 150 }),
    ];
    expect(recommendTraining(ratings, NOW)).toEqual([]);
  });

  it("severity high covers 3.5 ≤ mean < 4.0 boundary", () => {
    // mean responsiveness = 3.9
    const ratings = [
      r({ responsiveness: 3, daysAgo: 1 }),
      r({ responsiveness: 4, daysAgo: 2 }),
      r({ responsiveness: 4, daysAgo: 3 }),
      r({ responsiveness: 4, daysAgo: 4 }),
      r({ responsiveness: 4, daysAgo: 5 }),
      r({ responsiveness: 4, daysAgo: 6 }),
      r({ responsiveness: 4, daysAgo: 7 }),
      r({ responsiveness: 4, daysAgo: 8 }),
      r({ responsiveness: 4, daysAgo: 9 }),
      r({ responsiveness: 4, daysAgo: 10 }),
    ];
    const recs = recommendTraining(ratings, NOW);
    expect(recs.length).toBe(1);
    expect(recs[0].dimension).toBe("responsiveness");
    expect(recs[0].severity).toBe("high");
    expect(recs[0].averageScore).toBeCloseTo(3.9, 1);
  });
});
