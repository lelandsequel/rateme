import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  generateRecap,
  deterministicRecap,
  type RecapInputRating,
} from "./ai-recap";

function rating(overrides: Partial<RecapInputRating> = {}): RecapInputRating {
  return {
    responsiveness: 5,
    productKnowledge: 5,
    followThrough: 5,
    listeningNeedsFit: 5,
    trustIntegrity: 5,
    takeCallAgain: true,
    createdAt: new Date("2026-04-15T00:00:00Z"),
    ...overrides,
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
      // Spread over 30 days, every ~2.5 days.
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
    expect(r.performanceSummary).toMatch(/100% "take call again"/);
    expect(r.frequency).toMatch(/12 interactions/);
    expect(r.frequency).toMatch(/~2\.8\/week/);
    expect(r.topStrengths.length).toBeGreaterThan(0);
    expect(r.topWeaknesses).toEqual([]);
    expect(r.riskFlags).toEqual([]);
    expect(r.suggestedImprovements).toEqual([]);
  });

  it("identifies top strengths and weaknesses correctly from mixed averages", () => {
    // 4 ratings:
    //   responsiveness avg = (5+5+5+5)/4 = 5
    //   productKnowledge avg = (5+5+5+5)/4 = 5
    //   followThrough avg = (3+3+3+3)/4 = 3
    //   listeningNeedsFit avg = (2+2+2+2)/4 = 2
    //   trustIntegrity avg = (4+4+4+4)/4 = 4
    const base = (overrides: Partial<RecapInputRating>): RecapInputRating =>
      rating({
        responsiveness: 5,
        productKnowledge: 5,
        followThrough: 3,
        listeningNeedsFit: 2,
        trustIntegrity: 4,
        ...overrides,
      });
    const ratings = [
      base({ createdAt: new Date("2026-04-02T00:00:00Z") }),
      base({ createdAt: new Date("2026-04-09T00:00:00Z") }),
      base({ createdAt: new Date("2026-04-16T00:00:00Z") }),
      base({ createdAt: new Date("2026-04-23T00:00:00Z") }),
    ];
    const r = deterministicRecap({
      ratings,
      perspective: "REP",
      name: "Alice",
      company: "Acme",
    });
    // Strengths should be the >=4 dims, sorted desc.
    expect(r.topStrengths[0]).toMatch(/Responsiveness|Product knowledge/);
    expect(r.topStrengths.some((s) => s.includes("Trust"))).toBe(true);
    // Weaknesses: < 4. Lowest first.
    expect(r.topWeaknesses[0]).toMatch(/Listening/);
    expect(r.topWeaknesses[1]).toMatch(/Follow-through/);
    // Suggested improvements derived from weaknesses.
    expect(r.suggestedImprovements.length).toBe(r.topWeaknesses.length);
    expect(r.suggestedImprovements[0]).toMatch(/Improve listening/i);
    // Risk flag: 4/4 ratings had a dim <= 2 (listeningNeedsFit = 2)
    expect(r.riskFlags.some((f) => f.includes("4/4"))).toBe(true);
  });

  it("flags all-takeCallAgain-false as risk", () => {
    const ratings: RecapInputRating[] = [
      rating({ takeCallAgain: false, createdAt: new Date("2026-04-05T00:00:00Z") }),
      rating({ takeCallAgain: false, createdAt: new Date("2026-04-12T00:00:00Z") }),
      rating({ takeCallAgain: false, createdAt: new Date("2026-04-19T00:00:00Z") }),
    ];
    const r = deterministicRecap({
      ratings,
      perspective: "REP",
      name: "Alice",
      company: "Acme",
    });
    expect(r.performanceSummary).toMatch(/0% "take call again"/);
    expect(r.riskFlags.some((f) => f.includes("3/3"))).toBe(true);
    expect(r.riskFlags.some((f) => f.includes("100%"))).toBe(true);
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
    // All five dims below 4 → 5 weaknesses; should be capped to 3.
    const ratings: RecapInputRating[] = [
      rating({
        responsiveness: 1,
        productKnowledge: 2,
        followThrough: 2,
        listeningNeedsFit: 2,
        trustIntegrity: 1,
        takeCallAgain: false,
        createdAt: new Date("2026-04-05T00:00:00Z"),
      }),
      rating({
        responsiveness: 1,
        productKnowledge: 2,
        followThrough: 2,
        listeningNeedsFit: 2,
        trustIntegrity: 1,
        takeCallAgain: false,
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
    expect(r.riskFlags.length).toBe(3); // low dims + take-call-again + gap
  });

  it("orders weaknesses ascending by average (lowest first)", () => {
    const ratings = [
      rating({
        responsiveness: 1,
        productKnowledge: 3,
        followThrough: 2,
        listeningNeedsFit: 5,
        trustIntegrity: 5,
      }),
    ];
    const r = deterministicRecap({
      ratings,
      perspective: "REP",
      name: "Alice",
      company: "Acme",
    });
    // Order: responsiveness(1), followThrough(2), productKnowledge(3)
    expect(r.topWeaknesses[0]).toMatch(/Responsiveness/);
    expect(r.topWeaknesses[1]).toMatch(/Follow-through/);
    expect(r.topWeaknesses[2]).toMatch(/Product knowledge/);
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
