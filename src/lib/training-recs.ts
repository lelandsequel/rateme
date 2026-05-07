// Training recommendation engine.
//
// Pure-functional. Given a rep's recent ratings (last 90 days), surface
// the dimensions that are dragging them down and pair each with a canned
// suggestion + a couple of reference links. Concrete enough for a rep to
// act on without an AI in the loop.
//
// Inclusion rule for a dimension:
//   - mean < 4.0 (we only flag genuinely soft spots, not "good but not great")
//   - at least 3 ratings (one bad rating shouldn't earn a remediation card)
// Sort: ascending by mean (worst dimension first).
// Cap: at most 3 recommendations — we don't want to overwhelm.
//
// Severity buckets (from spec):
//   low    → mean < 3.0
//   medium → 3.0 ≤ mean < 3.5
//   high   → 3.5 ≤ mean < 4.0
// (i.e. "high" means "high score, low severity" — borderline-but-fixable.
// "low" is the worst and most urgent. The naming is intentional: "low
// score" = "low severity bucket" in plain English. We honor the spec
// thresholds verbatim.)

export type TrainingDimension =
  | "responsiveness"
  | "productKnowledge"
  | "followThrough"
  | "listeningNeedsFit"
  | "trustIntegrity";

export type TrainingSeverity = "low" | "medium" | "high";

export interface TrainingRec {
  dimension: TrainingDimension;
  averageScore: number;
  severity: TrainingSeverity;
  ratingsConsidered: number;
  suggestion: string;
  resources: Array<{ title: string; url: string }>;
}

interface RatingInput {
  responsiveness: number;
  productKnowledge: number;
  followThrough: number;
  listeningNeedsFit: number;
  trustIntegrity: number;
  createdAt: Date;
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const MIN_RATINGS = 3;
const SCORE_CEILING = 4.0;
const MAX_RECS = 3;

const DIMENSIONS: TrainingDimension[] = [
  "responsiveness",
  "productKnowledge",
  "followThrough",
  "listeningNeedsFit",
  "trustIntegrity",
];

const CONTENT: Record<
  TrainingDimension,
  { suggestion: string; resources: Array<{ title: string; url: string }> }
> = {
  responsiveness: {
    suggestion:
      "Reduce response time. Aim to acknowledge buyer messages within 4 business hours, even if it's just to confirm receipt and set an expected reply time.",
    resources: [
      {
        title: "Sales response time benchmarks",
        url: "https://www.ratemyrep.example/learn/responsiveness-benchmarks",
      },
      {
        title: "Inbox triage for B2B sellers",
        url: "https://www.ratemyrep.example/learn/inbox-triage",
      },
    ],
  },
  productKnowledge: {
    suggestion:
      "Deepen product expertise. Block 2 hours a week for product training and shadow a solutions-engineer call to plug factual gaps before they show up in a buyer call.",
    resources: [
      {
        title: "Building deep product fluency",
        url: "https://www.ratemyrep.example/learn/product-fluency",
      },
      {
        title: "Shadow-a-call playbook",
        url: "https://www.ratemyrep.example/learn/shadow-call-playbook",
      },
    ],
  },
  followThrough: {
    suggestion:
      "Tighten follow-through. After every buyer call, send a recap email within 24 hours with explicit next steps, owners, and dates — and add reminders for each promised action.",
    resources: [
      {
        title: "The 24-hour recap rule",
        url: "https://www.ratemyrep.example/learn/24-hour-recap",
      },
      {
        title: "Promise-tracking systems for AEs",
        url: "https://www.ratemyrep.example/learn/promise-tracking",
      },
    ],
  },
  listeningNeedsFit: {
    suggestion:
      "Improve discovery. Spend the first half of every intro call asking open-ended questions and reflecting back what you heard before pitching anything.",
    resources: [
      {
        title: "Open-ended discovery questions",
        url: "https://www.ratemyrep.example/learn/discovery-questions",
      },
      {
        title: "Active listening for sales",
        url: "https://www.ratemyrep.example/learn/active-listening",
      },
    ],
  },
  trustIntegrity: {
    suggestion:
      "Rebuild trust. Stop committing to anything you can't deliver, surface trade-offs early, and bring a peer or manager in to recover any account where a promise has slipped.",
    resources: [
      {
        title: "Repairing buyer trust after a slip",
        url: "https://www.ratemyrep.example/learn/repair-trust",
      },
      {
        title: "Honest deal qualification",
        url: "https://www.ratemyrep.example/learn/honest-qualification",
      },
    ],
  },
};

function severityFor(mean: number): TrainingSeverity {
  if (mean < 3.0) return "low";
  if (mean < 3.5) return "medium";
  return "high";
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/**
 * Compute training recommendations for a rep based on their last 90 days
 * of ratings.
 *
 * @param ratings  All known ratings for the rep (we filter by date here).
 * @param now      Defaults to new Date() — pin in tests for determinism.
 */
export function recommendTraining(
  ratings: ReadonlyArray<RatingInput>,
  now: Date = new Date(),
): TrainingRec[] {
  const cutoff = now.getTime() - NINETY_DAYS_MS;
  const recent = ratings.filter(
    (r) => new Date(r.createdAt).getTime() >= cutoff,
  );
  if (recent.length === 0) return [];

  const recs: TrainingRec[] = [];
  for (const dim of DIMENSIONS) {
    // We don't filter individual scores — every recent rating contributes
    // a value for every dimension. The MIN_RATINGS gate is on the count
    // of recent ratings, identical for all five.
    if (recent.length < MIN_RATINGS) continue;
    let sum = 0;
    for (const r of recent) sum += r[dim];
    const mean = sum / recent.length;
    if (mean >= SCORE_CEILING) continue;

    const content = CONTENT[dim];
    recs.push({
      dimension: dim,
      averageScore: round1(mean),
      severity: severityFor(mean),
      ratingsConsidered: recent.length,
      suggestion: content.suggestion,
      // Defensive copy so callers can't mutate the canned content.
      resources: content.resources.map((r) => ({ ...r })),
    });
  }

  recs.sort((a, b) => a.averageScore - b.averageScore);
  return recs.slice(0, MAX_RECS);
}
