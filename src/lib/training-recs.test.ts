/**
 * Tests for the training recommendation engine — V2 (dynamic answers).
 *
 * Coverage targets:
 *   - empty input → no recs
 *   - all-5s → no recs (everything above the 4.0 ceiling)
 *   - mixed weak questions → recs sorted ascending by mean, 90-day filter
 *   - fewer than 3 ratings in window → filtered out entirely
 *   - cap at 3 — even if 4+ questions would qualify
 *   - severity buckets honor the spec thresholds
 *   - unknown question key → falls back to a generic suggestion
 */

import { describe, it, expect } from "vitest";
import { recommendTraining } from "./training-recs";

const NOW = new Date("2026-04-29T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

interface RatingShape {
  answers: Array<{ score: number; question: { key: string; labelEn: string; ord: number } }>;
  createdAt: Date;
}

const KEYS = ["is_responsive", "is_knowledgeable", "meets_deadlines", "actively_listens", "is_accountable"] as const;
const LABEL: Record<string, string> = {
  is_responsive: "Is Responsive",
  is_knowledgeable: "Is Knowledgeable",
  meets_deadlines: "Meets Deadlines",
  actively_listens: "Actively Listens",
  is_accountable: "Is Accountable",
};

function r(scores: Partial<Record<(typeof KEYS)[number], number>> = {}, daysAgo = 1): RatingShape {
  return {
    createdAt: new Date(NOW.getTime() - daysAgo * DAY),
    answers: KEYS.map((k, i) => ({
      score: scores[k] ?? 5,
      question: { key: k, labelEn: LABEL[k], ord: i },
    })),
  };
}

describe("recommendTraining", () => {
  it("returns empty when there are no ratings", () => {
    expect(recommendTraining([], NOW)).toEqual([]);
  });

  it("returns empty when every question averages 5.0", () => {
    const ratings = [r(), r(), r(), r()];
    expect(recommendTraining(ratings, NOW)).toEqual([]);
  });

  it("returns empty when fewer than 3 ratings fall in the 90-day window", () => {
    const ratings = [
      r({ is_responsive: 1, is_knowledgeable: 1 }, 1),
      r({ is_responsive: 1, is_knowledgeable: 1 }, 2),
      r({ is_responsive: 1 }, 200),
      r({ is_responsive: 1 }, 365),
    ];
    expect(recommendTraining(ratings, NOW)).toEqual([]);
  });

  it("flags weak questions and sorts ascending by mean", () => {
    // 4 recent ratings:
    //   is_responsive avg = (2+2+2+2)/4 = 2.0  (low)
    //   is_knowledgeable avg = (3+3+3+3)/4 = 3.0 (medium)
    //   meets_deadlines avg = (4+4+4+4)/4 = 4.0 → at ceiling, EXCLUDED
    //   actively_listens avg = (5+5+5+5)/4 = 5.0 → EXCLUDED
    //   is_accountable avg = (3.5)
    const ratings = [
      r({ is_responsive: 2, is_knowledgeable: 3, meets_deadlines: 4, actively_listens: 5, is_accountable: 4 }, 5),
      r({ is_responsive: 2, is_knowledgeable: 3, meets_deadlines: 4, actively_listens: 5, is_accountable: 4 }, 10),
      r({ is_responsive: 2, is_knowledgeable: 3, meets_deadlines: 4, actively_listens: 5, is_accountable: 3 }, 20),
      r({ is_responsive: 2, is_knowledgeable: 3, meets_deadlines: 4, actively_listens: 5, is_accountable: 3 }, 40),
    ];
    const recs = recommendTraining(ratings, NOW);
    expect(recs.map((x) => x.dimension)).toEqual([
      "is_responsive",
      "is_knowledgeable",
      "is_accountable",
    ]);
    expect(recs[0].averageScore).toBe(2.0);
    expect(recs[0].severity).toBe("low");
    expect(recs[1].averageScore).toBe(3.0);
    expect(recs[1].severity).toBe("medium");
    expect(recs[2].averageScore).toBe(3.5);
    expect(recs[2].severity).toBe("high");
    for (const rec of recs) {
      expect(rec.suggestion.length).toBeGreaterThan(20);
      expect(rec.ratingsConsidered).toBe(4);
    }
  });

  it("caps at 3 recommendations even when 4+ questions qualify", () => {
    const allLow = (daysAgo: number): RatingShape =>
      r({ is_responsive: 2, is_knowledgeable: 2, meets_deadlines: 2, actively_listens: 2, is_accountable: 2 }, daysAgo);
    const ratings = [allLow(1), allLow(2), allLow(3)];
    const recs = recommendTraining(ratings, NOW);
    expect(recs.length).toBe(3);
  });

  it("excludes ratings older than 90 days from the average", () => {
    const ratings = [
      r({ is_responsive: 5 }, 1),
      r({ is_responsive: 5 }, 2),
      r({ is_responsive: 5 }, 3),
      r({ is_responsive: 1 }, 100),
      r({ is_responsive: 1 }, 120),
      r({ is_responsive: 1 }, 150),
    ];
    expect(recommendTraining(ratings, NOW)).toEqual([]);
  });

  it("severity high covers 3.5 ≤ mean < 4.0 boundary", () => {
    // 10 ratings, mean is_responsive ~3.9
    const ratings: RatingShape[] = [
      r({ is_responsive: 3 }, 1),
      r({ is_responsive: 4 }, 2),
      r({ is_responsive: 4 }, 3),
      r({ is_responsive: 4 }, 4),
      r({ is_responsive: 4 }, 5),
      r({ is_responsive: 4 }, 6),
      r({ is_responsive: 4 }, 7),
      r({ is_responsive: 4 }, 8),
      r({ is_responsive: 4 }, 9),
      r({ is_responsive: 4 }, 10),
    ];
    const recs = recommendTraining(ratings, NOW);
    expect(recs.length).toBe(1);
    expect(recs[0].dimension).toBe("is_responsive");
    expect(recs[0].severity).toBe("high");
    expect(recs[0].averageScore).toBeCloseTo(3.9, 1);
  });

  it("falls back to a generic suggestion + empty resources for unknown question keys", () => {
    const oddKey = "totally_made_up_key";
    const rating: RatingShape = {
      createdAt: new Date(NOW.getTime() - DAY),
      answers: [{ score: 2, question: { key: oddKey, labelEn: "Made Up Skill", ord: 0 } }],
    };
    const recs = recommendTraining([rating, rating, rating], NOW);
    expect(recs.length).toBe(1);
    expect(recs[0].dimension).toBe(oddKey);
    expect(recs[0].label).toBe("Made Up Skill");
    expect(recs[0].suggestion).toMatch(/Improve Made Up Skill/i);
    expect(recs[0].resources).toEqual([]);
  });
});
