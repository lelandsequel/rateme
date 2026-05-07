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

export interface RecapInputRating {
  responsiveness: number;
  productKnowledge: number;
  followThrough: number;
  listeningNeedsFit: number;
  trustIntegrity: number;
  takeCallAgain: boolean;
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

const DIM_LABELS: Record<keyof DimSums, string> = {
  responsiveness: "Responsiveness",
  productKnowledge: "Product knowledge",
  followThrough: "Follow-through",
  listeningNeedsFit: "Listening / needs fit",
  trustIntegrity: "Trust / integrity",
};

interface DimSums {
  responsiveness: number;
  productKnowledge: number;
  followThrough: number;
  listeningNeedsFit: number;
  trustIntegrity: number;
}

type DimKey = keyof DimSums;
const DIM_KEYS: DimKey[] = [
  "responsiveness",
  "productKnowledge",
  "followThrough",
  "listeningNeedsFit",
  "trustIntegrity",
];

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

export function deterministicRecap(input: RecapInput): Recap {
  const { ratings, perspective } = input;
  const n = ratings.length;
  if (n === 0) return emptyRecap();

  const sums: DimSums = {
    responsiveness: 0,
    productKnowledge: 0,
    followThrough: 0,
    listeningNeedsFit: 0,
    trustIntegrity: 0,
  };
  let yes = 0;
  let lowDimCount = 0;
  for (const r of ratings) {
    sums.responsiveness += r.responsiveness;
    sums.productKnowledge += r.productKnowledge;
    sums.followThrough += r.followThrough;
    sums.listeningNeedsFit += r.listeningNeedsFit;
    sums.trustIntegrity += r.trustIntegrity;
    if (r.takeCallAgain) yes++;
    if (
      r.responsiveness <= 2 ||
      r.productKnowledge <= 2 ||
      r.followThrough <= 2 ||
      r.listeningNeedsFit <= 2 ||
      r.trustIntegrity <= 2
    ) {
      lowDimCount++;
    }
  }
  const noCount = n - yes;

  const averages: Record<DimKey, number> = {
    responsiveness: round1(sums.responsiveness / n),
    productKnowledge: round1(sums.productKnowledge / n),
    followThrough: round1(sums.followThrough / n),
    listeningNeedsFit: round1(sums.listeningNeedsFit / n),
    trustIntegrity: round1(sums.trustIntegrity / n),
  };
  const overall = round1(
    DIM_KEYS.reduce((acc, k) => acc + averages[k], 0) / DIM_KEYS.length,
  );

  // Sort dimensions: highest average wins for strengths, lowest for weaknesses.
  const sortedDesc = [...DIM_KEYS].sort((a, b) => averages[b] - averages[a]);
  const sortedAsc = [...DIM_KEYS].sort((a, b) => averages[a] - averages[b]);

  const topStrengths = sortedDesc
    .filter((k) => averages[k] >= 4)
    .slice(0, 3)
    .map((k) => `${DIM_LABELS[k]} — averaging ${averages[k].toFixed(1)}`);

  const topWeaknesses = sortedAsc
    .filter((k) => averages[k] < 4)
    .slice(0, 3)
    .map((k) => `${DIM_LABELS[k]} — averaging ${averages[k].toFixed(1)}`);

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
    `${sentiment} month — ${n} rating${n === 1 ? "" : "s"} ${verb} averaging ${overall.toFixed(1)} across all dimensions, ` +
    `with a ${Math.round((yes / n) * 100)}% "take call again" rate.`;

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
  if (lowDimCount > 0) {
    riskFlags.push(`${lowDimCount}/${n} rating${lowDimCount === 1 ? "" : "s"} had at least one dimension scored 2 or below`);
  }
  if (noCount > 0) {
    const pct = Math.round((noCount / n) * 100);
    riskFlags.push(`${noCount}/${n} rater${noCount === 1 ? "" : "s"} (${pct}%) said they would not take a call again`);
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
      responsiveness: r.responsiveness,
      productKnowledge: r.productKnowledge,
      followThrough: r.followThrough,
      listeningNeedsFit: r.listeningNeedsFit,
      trustIntegrity: r.trustIntegrity,
      takeCallAgain: r.takeCallAgain,
      createdAt: new Date(r.createdAt).toISOString(),
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
  const sums: DimSums = {
    responsiveness: 0,
    productKnowledge: 0,
    followThrough: 0,
    listeningNeedsFit: 0,
    trustIntegrity: 0,
  };
  let yes = 0;
  for (const r of input.ratings) {
    sums.responsiveness += r.responsiveness;
    sums.productKnowledge += r.productKnowledge;
    sums.followThrough += r.followThrough;
    sums.listeningNeedsFit += r.listeningNeedsFit;
    sums.trustIntegrity += r.trustIntegrity;
    if (r.takeCallAgain) yes++;
  }
  return {
    averages: {
      responsiveness: round1(sums.responsiveness / n),
      productKnowledge: round1(sums.productKnowledge / n),
      followThrough: round1(sums.followThrough / n),
      listeningNeedsFit: round1(sums.listeningNeedsFit / n),
      trustIntegrity: round1(sums.trustIntegrity / n),
    },
    takeCallAgainPct: Math.round((yes / n) * 100),
  };
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
