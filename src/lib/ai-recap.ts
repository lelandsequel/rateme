// 30-day AI-augmented recap of rating activity, for either a REP (ratings
// received) or a RATER (ratings given).
//
// Two execution paths:
//   1. OPENAI_API_KEY set → call OpenAI Chat Completions in JSON-object mode
//      and use the structured result.
//   2. No key, or API/parse failure → deterministic fallback computed from
//      the rating data alone.
//
// Both paths return the same Recap shape; the `source` field tells the UI
// which one ran. Fallback exists so a missing/invalid key never breaks the
// page render.
//
// Phase 9 schema rewrite: ratings carry dynamic per-question answers, not
// 5 fixed dimensions. We aggregate over whatever questions show up in the
// input. "Buy from again" is gone entirely.

export interface AnswerForRecap {
  score: number;
  question: { key: string; labelEn: string; ord: number };
}

export interface RecapInputRating {
  answers: ReadonlyArray<AnswerForRecap>;
  createdAt: Date;
}

export interface RecapInput {
  ratings: Array<RecapInputRating>;
  perspective: "REP" | "RATER";
  name: string;
  company: string;
}

export interface Recap {
  performanceSummary: string;
  frequency: string;
  engagementConsistency: string;
  responseTiming: string;
  topStrengths: string[];
  topWeaknesses: string[];
  riskFlags: string[];
  suggestedImprovements: string[];
  source: "openai" | "deterministic";
}

interface QuestionAvg {
  key: string;
  labelEn: string;
  avg: number;
}

export async function generateRecap(input: RecapInput): Promise<Recap> {
  if (input.ratings.length === 0) {
    return emptyRecap();
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      const ai = await callOpenAI(input);
      if (ai) return ai;
    } catch (err) {
      console.error("[ai-recap] OpenAI call failed, falling back:", err);
    }
  }
  return deterministicRecap(input);
}

function emptyRecap(): Recap {
  return {
    performanceSummary: "No ratings in the last 30 days.",
    frequency: "0 interactions in 30 days.",
    engagementConsistency: "No engagement to analyze yet.",
    responseTiming: "Not tracked yet.",
    topStrengths: [],
    topWeaknesses: [],
    riskFlags: [],
    suggestedImprovements: [],
    source: "deterministic",
  };
}

/** Compute per-question averages across the input ratings. Sorted by ord. */
function perQuestionAverages(ratings: ReadonlyArray<RecapInputRating>): QuestionAvg[] {
  const perKey = new Map<string, { labelEn: string; ord: number; sum: number; n: number }>();
  for (const r of ratings) {
    for (const a of r.answers) {
      const slot = perKey.get(a.question.key);
      if (slot) {
        slot.sum += a.score;
        slot.n++;
      } else {
        perKey.set(a.question.key, {
          labelEn: a.question.labelEn,
          ord: a.question.ord,
          sum: a.score,
          n: 1,
        });
      }
    }
  }
  return Array.from(perKey.entries())
    .map(([key, slot]) => ({
      key,
      labelEn: slot.labelEn,
      avg: round1(slot.sum / slot.n),
      ord: slot.ord,
    }))
    .sort((a, b) => a.ord - b.ord)
    .map(({ key, labelEn, avg }) => ({ key, labelEn, avg }));
}

function ratingMean(r: RecapInputRating): number {
  if (r.answers.length === 0) return 0;
  let sum = 0;
  for (const a of r.answers) sum += a.score;
  return sum / r.answers.length;
}

export function deterministicRecap(input: RecapInput): Recap {
  const { ratings, perspective } = input;
  const n = ratings.length;
  if (n === 0) return emptyRecap();

  // Per-question averages + overall mean of per-rating means.
  const perQ = perQuestionAverages(ratings);
  let overallSum = 0;
  let overallN = 0;
  let lowAnswerRatingCount = 0;
  for (const r of ratings) {
    if (r.answers.length === 0) continue;
    overallSum += ratingMean(r);
    overallN++;
    let hasLow = false;
    for (const a of r.answers) {
      if (a.score <= 2) {
        hasLow = true;
        break;
      }
    }
    if (hasLow) lowAnswerRatingCount++;
  }
  const overall = overallN === 0 ? 0 : round1(overallSum / overallN);

  // Sort dimensions: highest average wins for strengths, lowest for weaknesses.
  const sortedDesc = [...perQ].sort((a, b) => b.avg - a.avg);
  const sortedAsc = [...perQ].sort((a, b) => a.avg - b.avg);

  const topStrengths = sortedDesc
    .filter((q) => q.avg >= 4)
    .slice(0, 3)
    .map((q) => `${q.labelEn} — averaging ${q.avg.toFixed(1)}`);

  const topWeaknesses = sortedAsc
    .filter((q) => q.avg < 4)
    .slice(0, 3)
    .map((q) => `${q.labelEn} — averaging ${q.avg.toFixed(1)}`);

  const suggestedImprovements = topWeaknesses.map((w) => {
    const colon = w.indexOf(" — ");
    const dim = colon === -1 ? w : w.slice(0, colon);
    return `Improve ${dim.toLowerCase()} — currently below the 4.0 bar`;
  });

  const { perWeek, maxGapDays } = frequencyMetrics(ratings);

  const verb = perspective === "REP" ? "received" : "given";
  const sentiment =
    overall >= 4.5 ? "Excellent" : overall >= 4 ? "Solid" : overall >= 3 ? "Mixed" : "Concerning";
  const performanceSummary =
    `${sentiment} month — ${n} rating${n === 1 ? "" : "s"} ${verb} averaging ${overall.toFixed(1)} across all questions.`;

  const frequency = `${n} interaction${n === 1 ? "" : "s"} in 30 days (~${perWeek.toFixed(1)}/week).`;

  const engagementConsistency =
    n === 1
      ? "Only one data point this month — too early to assess consistency."
      : maxGapDays >= 14
      ? `Inconsistent — longest gap between ratings was ${maxGapDays} days.`
      : maxGapDays >= 7
      ? `Steady — longest gap was ${maxGapDays} days.`
      : `Highly consistent — longest gap between ratings was only ${maxGapDays} days.`;

  const responseTiming =
    "Response timing not tracked yet — based on rating cadence, not message latency.";

  const riskFlags: string[] = [];
  if (lowAnswerRatingCount > 0) {
    riskFlags.push(
      `${lowAnswerRatingCount}/${n} rating${lowAnswerRatingCount === 1 ? "" : "s"} had at least one question scored 2 or below`,
    );
  }
  if (maxGapDays >= 14 && n >= 2) {
    riskFlags.push(`Engagement gap of ${maxGapDays} days suggests dropped activity`);
  }

  return {
    performanceSummary,
    frequency,
    engagementConsistency,
    responseTiming,
    topStrengths,
    topWeaknesses,
    riskFlags: riskFlags.slice(0, 3),
    suggestedImprovements: suggestedImprovements.slice(0, 3),
    source: "deterministic",
  };
}

function frequencyMetrics(ratings: ReadonlyArray<RecapInputRating>): {
  perWeek: number;
  maxGapDays: number;
} {
  const perWeek = ratings.length / (30 / 7);
  if (ratings.length < 2) return { perWeek, maxGapDays: 0 };

  const sorted = [...ratings]
    .map((r) => new Date(r.createdAt).getTime())
    .sort((a, b) => a - b);
  let maxGap = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap > maxGap) maxGap = gap;
  }
  const maxGapDays = Math.round(maxGap / (1000 * 60 * 60 * 24));
  return { perWeek, maxGapDays };
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

// ---------------------------------------------------------------------------
// OpenAI path — raw fetch, no SDK dependency.
// ---------------------------------------------------------------------------

async function callOpenAI(input: RecapInput): Promise<Recap | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const aggHint = aggregateHint(input);
  const userPayload = {
    perspective: input.perspective,
    name: input.name,
    company: input.company,
    ratingCount: input.ratings.length,
    aggregates: aggHint,
    ratings: input.ratings.map((r) => ({
      createdAt: new Date(r.createdAt).toISOString(),
      answers: r.answers.map((a) => ({
        key: a.question.key,
        label: a.question.labelEn,
        score: a.score,
      })),
    })),
  };

  const systemPrompt = [
    "You are an analyst summarizing a 30-day rating window for a sales rep or a rater.",
    "Return ONLY a JSON object that matches this exact schema (no extra keys):",
    "{",
    '  "performanceSummary": string,',
    '  "frequency": string,',
    '  "engagementConsistency": string,',
    '  "responseTiming": string,',
    '  "topStrengths": string[],',
    '  "topWeaknesses": string[],',
    '  "riskFlags": string[],',
    '  "suggestedImprovements": string[]',
    "}",
    "Each array has at most 3 items. Do not invent data not derivable from the input. Response timing is not tracked, so describe rating cadence instead.",
  ].join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${await safeText(res)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI: empty content");

  const parsed = JSON.parse(content) as unknown;
  return validateRecapShape(parsed);
}

function aggregateHint(input: RecapInput) {
  const n = input.ratings.length;
  if (n === 0) return null;
  const perQ = perQuestionAverages(input.ratings);
  return { perQuestion: perQ };
}

function validateRecapShape(raw: unknown): Recap | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : "");
  const arr = (k: string): string[] => {
    const v = r[k];
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === "string").slice(0, 3);
  };
  const out: Recap = {
    performanceSummary: str("performanceSummary"),
    frequency: str("frequency"),
    engagementConsistency: str("engagementConsistency"),
    responseTiming: str("responseTiming"),
    topStrengths: arr("topStrengths"),
    topWeaknesses: arr("topWeaknesses"),
    riskFlags: arr("riskFlags"),
    suggestedImprovements: arr("suggestedImprovements"),
    source: "openai",
  };
  if (!out.performanceSummary) return null;
  return out;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "";
  }
}
