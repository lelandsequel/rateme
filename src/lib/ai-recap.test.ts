import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  generateRecap,
  deterministicRecap,
  type RecapInputRating,
} from "./ai-recap";

const KEYS = ["is_responsive", "is_knowledgeable", "meets_deadlines", "actively_listens", "is_accountable"] as const;
const LABEL: Record<string, string> = {
  is_responsive: "Is Responsive",
  is_knowledgeable: "Is Knowledgeable",
  meets_deadlines: "Meets Deadlines",
  actively_listens: "Actively Listens",
  is_accountable: "Is Accountable",
};

function rating(opts: {
  scoresByKey?: Partial<Record<(typeof KEYS)[number], number>>;
  score?: number;
  createdAt?: Date;
} = {}): RecapInputRating {
  const base = opts.score ?? 5;
  return {
    createdAt: opts.createdAt ?? new Date("2026-04-15T00:00:00Z"),
    answers: KEYS.map((k, i) => ({
      score: opts.scoresByKey?.[k] ?? base,
      question: { key: k, labelEn: LABEL[k], ord: i },
    })),
  };
}

describe("generateRecap (deterministic path — no API key)", () => {
  let oldKey: string | undefined;
  beforeEach(() => {
    oldKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });
  afterEach(() => {
    if (oldKey !== undefined) process.env.OPENAI_API_KEY = oldKey;
  });

  it("returns minimal neutral recap for empty ratings (REP)", async () => {
    const r = await generateRecap({
      ratings: [],
      perspective: "REP",
      name: "Alice",
      company: "Acme",
    });
    expect(r.source).toBe("deterministic");
    expect(r.topStrengths).toEqual([]);
    expect(r.topWeaknesses).toEqual([]);
    expect(r.riskFlags).toEqual([]);
    expect(r.suggestedImprovements).toEqual([]);
    expect(r.performanceSummary).toMatch(/no ratings/i);
    expect(r.frequency).toMatch(/0 interactions/);
  });

  it("returns minimal neutral recap for empty ratings (RATER)", async () => {
    const r = await generateRecap({
      ratings: [],
      perspective: "RATER",
      name: "Bob",
      company: "Beta",
    });
    expect(r.source).toBe("deterministic");
    expect(r.topStrengths).toEqual([]);
  });

  it("calls deterministic when no key is set", async () => {
    const r = await generateRecap({
      ratings: [rating()],
      perspective: "REP",
      name: "Alice",
      company: "Acme",
    });
    expect(r.source).toBe("deterministic");
  });
});

describe("deterministicRecap", () => {
  it("returns excellent summary + no weaknesses on all-5s", () => {
    const ratings: RecapInputRating[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date("2026-04-01T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + i * 2);
      ratings.push(rating({ createdAt: d }));
    }
    const r = deterministicRecap({
      ratings,
      perspective: "REP",
      name: "Alice",
      company: "Acme",
    });
    expect(r.source).toBe("deterministic");
    expect(r.performanceSummary).toMatch(/excellent|solid/i);
    expect(r.performanceSummary).toMatch(/12 ratings received/i);
    // No "buy from again" mention.
    expect(r.performanceSummary).not.toMatch(/buy from again/i);
    expect(r.frequency).toMatch(/12 interactions/);
    expect(r.frequency).toMatch(/~2\.8\/week/);
    expect(r.topStrengths.length).toBeGreaterThan(0);
    expect(r.topWeaknesses).toEqual([]);
    expect(r.riskFlags).toEqual([]);
    expect(r.suggestedImprovements).toEqual([]);
  });

  it("identifies top strengths and weaknesses correctly from mixed averages", () => {
    // 4 ratings, fixed scores per question:
    //   is_responsive=5, is_knowledgeable=5, meets_deadlines=3,
    //   actively_listens=2, is_accountable=4
    const ratings = [
      rating({
        scoresByKey: { is_responsive: 5, is_knowledgeable: 5, meets_deadlines: 3, actively_listens: 2, is_accountable: 4 },
        createdAt: new Date("2026-04-02T00:00:00Z"),
      }),
      rating({
        scoresByKey: { is_responsive: 5, is_knowledgeable: 5, meets_deadlines: 3, actively_listens: 2, is_accountable: 4 },
        createdAt: new Date("2026-04-09T00:00:00Z"),
      }),
      rating({
        scoresByKey: { is_responsive: 5, is_knowledgeable: 5, meets_deadlines: 3, actively_listens: 2, is_accountable: 4 },
        createdAt: new Date("2026-04-16T00:00:00Z"),
      }),
      rating({
        scoresByKey: { is_responsive: 5, is_knowledgeable: 5, meets_deadlines: 3, actively_listens: 2, is_accountable: 4 },
        createdAt: new Date("2026-04-23T00:00:00Z"),
      }),
    ];
    const r = deterministicRecap({
      ratings,
      perspective: "REP",
      name: "Alice",
      company: "Acme",
    });
    // Strengths: questions averaging >= 4, sorted desc.
    expect(r.topStrengths[0]).toMatch(/Is Responsive|Is Knowledgeable/);
    expect(r.topStrengths.some((s) => s.includes("Is Accountable"))).toBe(true);
    // Weaknesses: < 4. Lowest first.
    expect(r.topWeaknesses[0]).toMatch(/Actively Listens/);
    expect(r.topWeaknesses[1]).toMatch(/Meets Deadlines/);
    // Suggested improvements derived from weaknesses.
    expect(r.suggestedImprovements.length).toBe(r.topWeaknesses.length);
    expect(r.suggestedImprovements[0]).toMatch(/Improve actively listens/i);
    // Risk flag: 4/4 ratings had a question scored <= 2 (actively_listens=2)
    expect(r.riskFlags.some((f) => f.includes("4/4"))).toBe(true);
  });

  it("flags long gaps as inconsistent engagement", () => {
    const ratings = [
      rating({ createdAt: new Date("2026-04-01T00:00:00Z") }),
      rating({ createdAt: new Date("2026-04-02T00:00:00Z") }),
      // Long 20-day gap
      rating({ createdAt: new Date("2026-04-22T00:00:00Z") }),
    ];
    const r = deterministicRecap({
      ratings,
      perspective: "REP",
      name: "Alice",
      company: "Acme",
    });
    expect(r.engagementConsistency).toMatch(/inconsistent/i);
    expect(r.engagementConsistency).toMatch(/20 days/);
    expect(r.riskFlags.some((f) => f.toLowerCase().includes("gap"))).toBe(true);
  });

  it("describes single-rating consistency neutrally", () => {
    const r = deterministicRecap({
      ratings: [rating({ createdAt: new Date("2026-04-15T00:00:00Z") })],
      perspective: "REP",
      name: "Alice",
      company: "Acme",
    });
    expect(r.engagementConsistency).toMatch(/too early/i);
    expect(r.frequency).toMatch(/1 interaction/);
  });

  it("uses 'given' verb for RATER perspective", () => {
    const r = deterministicRecap({
      ratings: [rating(), rating()],
      perspective: "RATER",
      name: "Bob",
      company: "Beta",
    });
    expect(r.performanceSummary).toMatch(/2 ratings given/i);
  });

  it("caps strengths/weaknesses at 3 and risks at 3", () => {
    // All five questions below 4 → 5 weaknesses; should be capped to 3.
    const ratings: RecapInputRating[] = [
      rating({
        scoresByKey: { is_responsive: 1, is_knowledgeable: 2, meets_deadlines: 2, actively_listens: 2, is_accountable: 1 },
        createdAt: new Date("2026-04-05T00:00:00Z"),
      }),
      rating({
        scoresByKey: { is_responsive: 1, is_knowledgeable: 2, meets_deadlines: 2, actively_listens: 2, is_accountable: 1 },
        createdAt: new Date("2026-04-25T00:00:00Z"), // 20-day gap
      }),
    ];
    const r = deterministicRecap({
      ratings,
      perspective: "REP",
      name: "Alice",
      company: "Acme",
    });
    expect(r.topStrengths.length).toBe(0);
    expect(r.topWeaknesses.length).toBe(3);
    expect(r.suggestedImprovements.length).toBe(3);
    // Two risk flags max here (low-answer + gap); takeCallAgain is gone.
    expect(r.riskFlags.length).toBeGreaterThanOrEqual(1);
    expect(r.riskFlags.length).toBeLessThanOrEqual(3);
  });

  it("orders weaknesses ascending by average (lowest first)", () => {
    const ratings = [
      rating({
        scoresByKey: { is_responsive: 1, is_knowledgeable: 3, meets_deadlines: 2, actively_listens: 5, is_accountable: 5 },
      }),
    ];
    const r = deterministicRecap({
      ratings,
      perspective: "REP",
      name: "Alice",
      company: "Acme",
    });
    // Order: is_responsive(1), meets_deadlines(2), is_knowledgeable(3)
    expect(r.topWeaknesses[0]).toMatch(/Is Responsive/);
    expect(r.topWeaknesses[1]).toMatch(/Meets Deadlines/);
    expect(r.topWeaknesses[2]).toMatch(/Is Knowledgeable/);
  });

  it("response timing field is present and a non-empty string placeholder", () => {
    const r = deterministicRecap({
      ratings: [rating()],
      perspective: "REP",
      name: "Alice",
      company: "Acme",
    });
    expect(typeof r.responseTiming).toBe("string");
    expect(r.responseTiming.length).toBeGreaterThan(0);
  });
});
