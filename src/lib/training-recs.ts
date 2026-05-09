// Training recommendation engine.
//
// Pure-functional. Given a rep's recent ratings (last 90 days), surface
// the dimensions/questions that are dragging them down and pair each with
// a canned suggestion + a couple of reference links. Concrete enough for
// a rep to act on without an AI in the loop.
//
// Inclusion rule for a question:
//   - mean < 4.0 (we only flag genuinely soft spots, not "good but not great")
//   - at least 3 ratings in the 90d window
// Sort: ascending by mean (worst question first).
// Cap: at most 3 recommendations.
//
// Severity buckets (from spec):
//   low    → mean < 3.0
//   medium → 3.0 ≤ mean < 3.5
//   high   → 3.5 ≤ mean < 4.0
//
// Phase 9 schema rewrite: question keys are now dynamic (one of 30+
// possible keys across the four V2 question sets). We map known keys to
// canned suggestions and fall back to a generic "Improve {label}" for
// any unknown key.

export type TrainingSeverity = "low" | "medium" | "high";

export interface TrainingRec {
  /** The question key driving this recommendation. */
  dimension: string;
  /** Pretty label (English) for display. */
  label: string;
  averageScore: number;
  severity: TrainingSeverity;
  ratingsConsidered: number;
  suggestion: string;
  resources: Array<{ title: string; url: string }>;
}

interface AnswerInput {
  score: number;
  question: { key: string; labelEn: string; ord: number };
}

interface RatingInput {
  answers: ReadonlyArray<AnswerInput>;
  createdAt: Date;
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const MIN_RATINGS = 3;
const SCORE_CEILING = 4.0;
const MAX_RECS = 3;

interface CannedContent {
  suggestion: string;
  resources: Array<{ title: string; url: string }>;
}

// Canned content keyed by question.key. Anything not in here falls back to
// the generic builder.
const CONTENT: Record<string, CannedContent> = {
  is_responsive: {
    suggestion:
      "Reduce response time. Aim to acknowledge buyer messages within 4 business hours, even if it's just to confirm receipt and set an expected reply time.",
    resources: [
      { title: "Sales response time benchmarks", url: "https://www.ratemyrep.example/learn/responsiveness-benchmarks" },
      { title: "Inbox triage for B2B sellers", url: "https://www.ratemyrep.example/learn/inbox-triage" },
    ],
  },
  is_knowledgeable: {
    suggestion:
      "Deepen product expertise. Block 2 hours a week for product training and shadow a solutions-engineer call to plug factual gaps before they show up in a buyer call.",
    resources: [
      { title: "Building deep product fluency", url: "https://www.ratemyrep.example/learn/product-fluency" },
      { title: "Shadow-a-call playbook", url: "https://www.ratemyrep.example/learn/shadow-call-playbook" },
    ],
  },
  meets_deadlines: {
    suggestion:
      "Tighten follow-through. After every buyer call, send a recap email within 24 hours with explicit next steps, owners, and dates — and add reminders for each promised action.",
    resources: [
      { title: "The 24-hour recap rule", url: "https://www.ratemyrep.example/learn/24-hour-recap" },
      { title: "Promise-tracking systems for AEs", url: "https://www.ratemyrep.example/learn/promise-tracking" },
    ],
  },
  delivers_on_commitments: {
    suggestion:
      "Tighten follow-through. Track every commitment you make and confirm completion in writing within the agreed window.",
    resources: [
      { title: "The 24-hour recap rule", url: "https://www.ratemyrep.example/learn/24-hour-recap" },
      { title: "Promise-tracking systems for AEs", url: "https://www.ratemyrep.example/learn/promise-tracking" },
    ],
  },
  actively_listens: {
    suggestion:
      "Improve discovery. Spend the first half of every intro call asking open-ended questions and reflecting back what you heard before pitching anything.",
    resources: [
      { title: "Open-ended discovery questions", url: "https://www.ratemyrep.example/learn/discovery-questions" },
      { title: "Active listening for sales", url: "https://www.ratemyrep.example/learn/active-listening" },
    ],
  },
  is_accountable: {
    suggestion:
      "Rebuild trust. Stop committing to anything you can't deliver, surface trade-offs early, and bring a peer or manager in to recover any account where a promise has slipped.",
    resources: [
      { title: "Repairing buyer trust after a slip", url: "https://www.ratemyrep.example/learn/repair-trust" },
      { title: "Honest deal qualification", url: "https://www.ratemyrep.example/learn/honest-qualification" },
    ],
  },
  demonstrates_accountability: {
    suggestion:
      "Rebuild trust. Stop committing to anything you can't deliver, surface trade-offs early, and bring a peer or manager in to recover any account where a promise has slipped.",
    resources: [
      { title: "Repairing buyer trust after a slip", url: "https://www.ratemyrep.example/learn/repair-trust" },
      { title: "Honest deal qualification", url: "https://www.ratemyrep.example/learn/honest-qualification" },
    ],
  },
  effectively_communicates: {
    suggestion:
      "Sharpen written + verbal communication. Practice one-paragraph deal updates and rehearse the discovery → pitch → next-step arc out loud before each call.",
    resources: [
      { title: "Concise B2B writing", url: "https://www.ratemyrep.example/learn/concise-writing" },
      { title: "Pitch rehearsal patterns", url: "https://www.ratemyrep.example/learn/pitch-rehearsal" },
    ],
  },
  reaches_out_proactively: {
    suggestion:
      "Set a weekly proactive-outreach quota — 5 warm-account check-ins every Monday. Don't wait for buyers to ask; bring them news, benchmarks, or a relevant peer story.",
    resources: [
      { title: "Proactive outreach playbook", url: "https://www.ratemyrep.example/learn/proactive-outreach" },
    ],
  },
  adheres_to_safety: {
    suggestion:
      "Refresh safety protocol training and cross-check every site visit against your company's checklist before stepping in.",
    resources: [
      { title: "On-site safety checklist", url: "https://www.ratemyrep.example/learn/site-safety" },
    ],
  },
  is_committed_to_safety: {
    suggestion:
      "Refresh safety protocol training and cross-check every site visit against your company's checklist before stepping in.",
    resources: [
      { title: "On-site safety checklist", url: "https://www.ratemyrep.example/learn/site-safety" },
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

  // Group answers by question.key, summing scores + tracking labels.
  const perKey = new Map<string, { labelEn: string; ord: number; sum: number; n: number }>();
  for (const r of recent) {
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

  const recs: TrainingRec[] = [];
  for (const [key, slot] of perKey.entries()) {
    if (slot.n < MIN_RATINGS) continue;
    const mean = slot.sum / slot.n;
    if (mean >= SCORE_CEILING) continue;

    const canned = CONTENT[key];
    const rec: TrainingRec = {
      dimension: key,
      label: slot.labelEn,
      averageScore: round1(mean),
      severity: severityFor(mean),
      ratingsConsidered: slot.n,
      suggestion: canned
        ? canned.suggestion
        : `Improve ${slot.labelEn} — currently averaging below the 4.0 bar across recent ratings.`,
      resources: canned ? canned.resources.map((r) => ({ ...r })) : [],
    };
    recs.push(rec);
  }

  recs.sort((a, b) => a.averageScore - b.averageScore || a.dimension.localeCompare(b.dimension));
  return recs.slice(0, MAX_RECS);
}
