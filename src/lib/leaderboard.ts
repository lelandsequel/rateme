/**
 * Pure leaderboard ranking math.
 *
 * Lives separately from the route so it can be unit-tested without pulling
 * in the route handler's dependency tree (next-auth, prisma, etc.).
 */

export type Band = "thriving" | "steady" | "watch" | "at-risk";

export function bandFor(score: number): Band {
  if (score >= 90) return "thriving";
  if (score >= 75) return "steady";
  if (score >= 60) return "watch";
  return "at-risk";
}

export interface RepInput {
  id: string;
  name: string;
  teamName: string;
  /** Most recent score (already pulled by caller). */
  latestScore: number;
  latestConfidence: number;
  /** Score immediately preceding latestScore, if it exists. */
  previousScore: number | null;
}

export interface LeaderRow {
  repId: string;
  name: string;
  teamName: string;
  score: number;
  band: Band;
  rank: number;
  percentile: number;
  trend: "up" | "flat" | "down";
  confidence: number;
}

/**
 * Sort by score desc and assign ranks (ties share a rank, the next
 * distinct score gets the rank equal to its 1-based index).
 *
 * Percentile per spec: 100 * (totalReps - rank + 1) / totalReps.
 *
 * Trend: "up" / "flat" / "down" derived from previousScore. Null prior
 * resolves to "flat" — the most conservative choice for a new rep.
 */
export function rankReps(reps: RepInput[]): LeaderRow[] {
  if (reps.length === 0) return [];

  const sorted = [...reps].sort((a, b) => {
    if (b.latestScore !== a.latestScore) return b.latestScore - a.latestScore;
    return a.name.localeCompare(b.name);
  });

  const total = sorted.length;
  const rows: LeaderRow[] = [];

  let prevScore = Number.POSITIVE_INFINITY;
  let rank = 0;

  sorted.forEach((r, index) => {
    if (r.latestScore !== prevScore) {
      rank = index + 1;
      prevScore = r.latestScore;
    }

    const percentile = Math.round(((total - rank + 1) / total) * 1000) / 10;

    let trend: "up" | "flat" | "down" = "flat";
    if (r.previousScore !== null) {
      if (r.latestScore > r.previousScore) trend = "up";
      else if (r.latestScore < r.previousScore) trend = "down";
    }

    rows.push({
      repId: r.id,
      name: r.name,
      teamName: r.teamName,
      score: Math.round(r.latestScore * 10) / 10,
      band: bandFor(r.latestScore),
      rank,
      percentile,
      trend,
      confidence: Math.round(r.latestConfidence * 100) / 100,
    });
  });

  return rows;
}
