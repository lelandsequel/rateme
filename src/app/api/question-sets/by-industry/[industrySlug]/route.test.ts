/**
 * Tests for GET /api/question-sets/by-industry/:industrySlug.
 *
 * Public endpoint (no auth) — the rating form needs the question set
 * before the rater submits. Tests cover:
 *   - 404 for unknown industry
 *   - 404 for an industry with no question set linked
 *   - 200 + ordered questions on the happy path
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

interface IndustryRow {
  slug: string;
  questionSet: {
    slug: string;
    name: string;
    questions: Array<{
      id: string;
      key: string;
      ord: number;
      labelEn: string;
      labelEs: string;
      labelPt: string;
    }>;
  } | null;
}

const state: { industries: IndustryRow[] } = { industries: [] };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    industry: {
      findUnique: vi.fn(async (args: { where: { slug: string }; select?: unknown }) => {
        const ind = state.industries.find((i) => i.slug === args.where.slug);
        if (!ind) return null;
        return { questionSet: ind.questionSet };
      }),
    },
  },
}));

async function callRoute(industrySlug: string): Promise<Response> {
  const mod = await import("./route");
  return mod.GET(
    new Request(`http://localhost/api/question-sets/by-industry/${industrySlug}`),
    { params: Promise.resolve({ industrySlug }) },
  );
}

beforeEach(() => {
  state.industries = [
    {
      slug: "information-technology",
      questionSet: {
        slug: "standard-sales",
        name: "Standard Sales",
        questions: [
          { id: "q-1", key: "is_professional", ord: 0, labelEn: "Is Professional", labelEs: "Es Profesional", labelPt: "É Profissional" },
          { id: "q-2", key: "actively_listens", ord: 1, labelEn: "Actively Listens", labelEs: "Escucha Activamente", labelPt: "Ouve Ativamente" },
        ],
      },
    },
    { slug: "orphan-industry", questionSet: null },
  ];
});

describe("GET /api/question-sets/by-industry/:industrySlug", () => {
  it("returns 404 for an unknown industry slug", async () => {
    const res = await callRoute("does-not-exist");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 404 when the industry has no question set linked", async () => {
    const res = await callRoute("orphan-industry");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/no question set/i);
  });

  it("returns 200 with the question set on the happy path", async () => {
    const res = await callRoute("information-technology");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.questionSet.slug).toBe("standard-sales");
    expect(body.questionSet.name).toBe("Standard Sales");
    expect(body.questionSet.questions).toHaveLength(2);
    expect(body.questionSet.questions[0].key).toBe("is_professional");
    expect(body.questionSet.questions[0].labelEs).toBe("Es Profesional");
    expect(body.questionSet.questions[0].labelPt).toBe("É Profissional");
    expect(body.questionSet.questions[1].key).toBe("actively_listens");
  });
});
