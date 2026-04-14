// Mock data — used when DATABASE_URL is not set.
// Shapes match what every page actually accesses.

export const mockTeams = [
  {
    id: "team-1",
    name: "Sales — East",
    description: "Enterprise accounts covering eastern region.",
    reps: [] as any[],
  },
  {
    id: "team-2",
    name: "Sales — West",
    description: "Mid-market and SMB accounts, western region.",
    reps: [] as any[],
  },
  {
    id: "team-3",
    name: "Sales — Central",
    description: "Strategic accounts across central markets.",
    reps: [] as any[],
  },
];

export const mockReps = [
  {
    id: "rep-1",
    name: "Elena Vance",
    email: "elena.vance@demo.com",
    phone: "+1 (512) 555-0101",
    title: "Senior Account Executive",
    department: "Enterprise Sales",
    status: "ACTIVE",
    teamId: "team-1",
    hiredAt: new Date("2022-03-15"),
    hireDate: new Date("2022-03-15"),
    team: { name: "Sales — East" },
    scores: [
      { id: "s1a", score: 94.2, confidence: 0.91, calculatedAt: new Date(), dimension: "overall" },
      { id: "s1b", score: 91.8, confidence: 0.89, calculatedAt: new Date(Date.now() - 7 * 86400000), dimension: "overall" },
    ],
    sessions: [
      { id: "sess-1", title: "Discovery Call — Acme Corp", type: "CALL", startedAt: new Date(Date.now() - 3600000), sentiment: 0.78 },
      { id: "sess-2", title: "Follow-up Demo", type: "DEMO", startedAt: new Date(Date.now() - 86400000), sentiment: 0.65 },
    ],
  },
  {
    id: "rep-2",
    name: "Marcus Webb",
    email: "marcus.webb@demo.com",
    phone: "+1 (512) 555-0102",
    title: "Account Executive",
    department: "Mid-Market",
    status: "ACTIVE",
    teamId: "team-2",
    hiredAt: new Date("2023-01-10"),
    hireDate: new Date("2023-01-10"),
    team: { name: "Sales — West" },
    scores: [
      { id: "s2a", score: 87.5, confidence: 0.84, calculatedAt: new Date(), dimension: "overall" },
      { id: "s2b", score: 85.0, confidence: 0.82, calculatedAt: new Date(Date.now() - 7 * 86400000), dimension: "overall" },
    ],
    sessions: [
      { id: "sess-3", title: "Intro Call — Beta LLC", type: "CALL", startedAt: new Date(Date.now() - 7200000), sentiment: 0.55 },
    ],
  },
  {
    id: "rep-3",
    name: "Priya Okonkwo",
    email: "priya.okonkwo@demo.com",
    phone: "+1 (512) 555-0103",
    title: "Sales Manager",
    department: "Enterprise Sales",
    status: "ACTIVE",
    teamId: "team-1",
    hiredAt: new Date("2021-06-01"),
    hireDate: new Date("2021-06-01"),
    team: { name: "Sales — East" },
    scores: [
      { id: "s3a", score: 91.0, confidence: 0.88, calculatedAt: new Date(), dimension: "overall" },
      { id: "s3b", score: 90.2, confidence: 0.87, calculatedAt: new Date(Date.now() - 7 * 86400000), dimension: "overall" },
    ],
    sessions: [],
  },
  {
    id: "rep-4",
    name: "James Holloway",
    email: "james.holloway@demo.com",
    phone: "+1 (512) 555-0104",
    title: "Account Executive",
    department: "SMB",
    status: "ACTIVE",
    teamId: "team-3",
    hiredAt: new Date("2023-07-20"),
    hireDate: new Date("2023-07-20"),
    team: { name: "Sales — Central" },
    scores: [
      { id: "s4a", score: 68.3, confidence: 0.72, calculatedAt: new Date(), dimension: "overall" },
      { id: "s4b", score: 71.0, confidence: 0.74, calculatedAt: new Date(Date.now() - 7 * 86400000), dimension: "overall" },
    ],
    sessions: [],
  },
  {
    id: "rep-5",
    name: "Sofia Delgado",
    email: "sofia.delgado@demo.com",
    phone: "+1 (512) 555-0105",
    title: "Enterprise Account Executive",
    department: "Enterprise Sales",
    status: "ACTIVE",
    teamId: "team-2",
    hiredAt: new Date("2022-11-03"),
    hireDate: new Date("2022-11-03"),
    team: { name: "Sales — West" },
    scores: [
      { id: "s5a", score: 79.6, confidence: 0.78, calculatedAt: new Date(), dimension: "overall" },
      { id: "s5b", score: 77.1, confidence: 0.76, calculatedAt: new Date(Date.now() - 7 * 86400000), dimension: "overall" },
    ],
    sessions: [
      { id: "sess-4", title: "Renewal Discussion", type: "CALL", startedAt: new Date(Date.now() - 1800000), sentiment: 0.70 },
    ],
  },
];

// Wire reps into teams
mockTeams[0].reps = mockReps.filter(r => r.teamId === "team-1") as any[];
mockTeams[1].reps = mockReps.filter(r => r.teamId === "team-2") as any[];
mockTeams[2].reps = mockReps.filter(r => r.teamId === "team-3") as any[];

export const mockAlerts = [
  {
    id: "alert-1",
    title: "Score Drop Detected",
    message: "James Holloway dropped 2.7 points this week. Coaching recommended.",
    type: "SCORE_DROP",
    severity: "WARNING",
    status: "open",
    createdAt: new Date(Date.now() - 3600000 * 2),
    acknowledged: false,
  },
  {
    id: "alert-2",
    title: "Anomaly: Call Duration Spike",
    message: "Marcus Webb's average call duration increased 140% — review required.",
    type: "ANOMALY",
    severity: "CRITICAL",
    status: "open",
    createdAt: new Date(Date.now() - 3600000 * 5),
    acknowledged: false,
  },
  {
    id: "alert-3",
    title: "Milestone: Elena Vance hits 94",
    message: "Elena Vance has crossed the 94-point threshold for the first time.",
    type: "MILESTONE",
    severity: "INFO",
    status: "open",
    createdAt: new Date(Date.now() - 3600000 * 8),
    acknowledged: true,
  },
  {
    id: "alert-4",
    title: "Low Confidence Score",
    message: "Sofia Delgado's confidence score fell below 80%. More session data needed.",
    type: "LOW_CONFIDENCE",
    severity: "WARNING",
    status: "open",
    createdAt: new Date(Date.now() - 86400000),
    acknowledged: false,
  },
];

export const mockBenchmarks = [
  {
    id: "bench-1",
    name: "Top Performer Threshold",
    type: "threshold",
    formula: "score >= 90",
    thresholds: JSON.stringify({ excellent: 90, good: 80, needsImprovement: 70 }),
  },
  {
    id: "bench-2",
    name: "Confidence Floor",
    type: "threshold",
    formula: "confidence >= 0.80",
    thresholds: JSON.stringify({ excellent: 0.90, good: 0.80, needsImprovement: 0.65 }),
  },
  {
    id: "bench-3",
    name: "Weekly Score Growth",
    type: "growth",
    formula: "(currentScore - prevScore) / prevScore",
    thresholds: JSON.stringify({ excellent: 5, good: 2, needsImprovement: 0 }),
  },
];

export const mockTenant = {
  id: "tenant-demo",
  name: "Demo Enterprise",
  slug: "demo",
};
