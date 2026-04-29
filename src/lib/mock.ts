// Mock data — used when DATABASE_URL is not set.
// Shapes match what every page actually accesses.
//
// Mobile MVP extensions (added 2026-04-27):
//   - SESSION rows now carry `score` (0..100) + `flags` (string[])
//   - ALERT rows can carry `scoreDelta` + `driver` for SCORE_DELTA events
//   - mockReps[].sessions[] flags cover the full coaching-rule surface
//     (low-sentiment, high-engagement, long-duration, early-wake)

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
      { id: "s1a", score: 94.2, confidence: 0.91, calculatedAt: new Date(), dimension: "overall", period: "This week" },
      { id: "s1b", score: 91.8, confidence: 0.89, calculatedAt: new Date(Date.now() - 7 * 86400000), dimension: "overall", period: "Last week" },
    ],
    sessions: [
      { id: "sess-1", title: "Discovery Call — Acme Corp", type: "CALL", startedAt: new Date(Date.now() - 3600000), sentiment: 0.78, score: 92, flags: ["high-engagement"] },
      { id: "sess-2", title: "Follow-up Demo", type: "DEMO", startedAt: new Date(Date.now() - 86400000), sentiment: 0.65, score: 88, flags: [] },
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
      { id: "s2a", score: 87.5, confidence: 0.84, calculatedAt: new Date(), dimension: "overall", period: "This week" },
      { id: "s2b", score: 85.0, confidence: 0.82, calculatedAt: new Date(Date.now() - 7 * 86400000), dimension: "overall", period: "Last week" },
    ],
    sessions: [
      { id: "sess-3", title: "Intro Call — Beta LLC", type: "CALL", startedAt: new Date(Date.now() - 7200000), sentiment: 0.55, score: 78, flags: [] },
      { id: "sess-3b", title: "Pricing Conversation — Beta LLC", type: "MEETING", startedAt: new Date(Date.now() - 86400000 * 2), sentiment: 0.32, score: 58, flags: ["low-sentiment"] },
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
      { id: "s3a", score: 91.0, confidence: 0.88, calculatedAt: new Date(), dimension: "overall", period: "This week" },
      { id: "s3b", score: 90.2, confidence: 0.87, calculatedAt: new Date(Date.now() - 7 * 86400000), dimension: "overall", period: "Last week" },
    ],
    sessions: [
      { id: "sess-3p", title: "Strategic QBR — Cobalt Industries", type: "MEETING", startedAt: new Date(Date.now() - 86400000 * 1), sentiment: 0.82, score: 90, flags: ["high-engagement"] },
    ],
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
      { id: "s4a", score: 68.3, confidence: 0.72, calculatedAt: new Date(), dimension: "overall", period: "This week" },
      { id: "s4b", score: 71.0, confidence: 0.74, calculatedAt: new Date(Date.now() - 7 * 86400000), dimension: "overall", period: "Last week" },
    ],
    // Multiple low-sentiment + early-wake flags so the coaching rule "reduce
    // talk-ratio" fires for this rep in mock-mode.
    sessions: [
      { id: "sess-4a", title: "Cold Call — Apex Foods", type: "CALL", startedAt: new Date(new Date().setHours(6, 30, 0, 0) - 86400000), sentiment: 0.30, score: 48, flags: ["low-sentiment", "early-wake"] },
      { id: "sess-4b", title: "Renewal Pitch — Lyra Co", type: "CALL", startedAt: new Date(new Date().setHours(6, 45, 0, 0) - 86400000 * 2), sentiment: 0.28, score: 46, flags: ["low-sentiment", "early-wake"] },
      { id: "sess-4c", title: "Discovery — Mox Health", type: "CALL", startedAt: new Date(Date.now() - 86400000 * 3), sentiment: 0.35, score: 52, flags: ["low-sentiment"] },
    ],
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
      { id: "s5a", score: 79.6, confidence: 0.78, calculatedAt: new Date(), dimension: "overall", period: "This week" },
      { id: "s5b", score: 77.1, confidence: 0.76, calculatedAt: new Date(Date.now() - 7 * 86400000), dimension: "overall", period: "Last week" },
    ],
    sessions: [
      { id: "sess-5", title: "Renewal Discussion", type: "CALL", startedAt: new Date(Date.now() - 1800000), sentiment: 0.70, score: 84, flags: [] },
      { id: "sess-5b", title: "Late-night Sync — EU Counterparty", type: "MEETING", startedAt: new Date(new Date().setHours(21, 30, 0, 0) - 86400000), sentiment: 0.62, score: 70, flags: ["late-night"] },
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
  // ---- Score-attributed feed events (mobile MVP) -----------------------
  // These power the mobile "Feed" tab — type:"SCORE_DELTA" carries
  // scoreDelta + driver so the client can render "+4 pts — strong close".
  {
    id: "alert-5",
    title: "+4 pts — Strong close rate",
    message: "Elena Vance: score moved from 90 to 94 (strong close rate).",
    type: "SCORE_DELTA",
    severity: "INFO",
    status: "open",
    createdAt: new Date(Date.now() - 3600000 * 1),
    acknowledged: false,
    scoreDelta: 4.0,
    driver: "Strong close rate",
  },
  {
    id: "alert-6",
    title: "-3 pts — Low activity yesterday",
    message: "James Holloway: score moved from 71 to 68 (low activity yesterday).",
    type: "SCORE_DELTA",
    severity: "INFO",
    status: "open",
    createdAt: new Date(Date.now() - 3600000 * 4),
    acknowledged: false,
    scoreDelta: -3.0,
    driver: "Low activity yesterday",
  },
  {
    id: "alert-7",
    title: "-12 pts — Customer sentiment lagging",
    message: "Marcus Webb: score moved from 87 to 75 (customer sentiment lagging).",
    type: "SCORE_DELTA",
    severity: "CRITICAL",
    status: "open",
    createdAt: new Date(Date.now() - 3600000 * 12),
    acknowledged: false,
    scoreDelta: -12.0,
    driver: "Customer sentiment lagging",
  },
  {
    id: "alert-8",
    title: "+2 pts — Steady activity cadence",
    message: "Sofia Delgado: score moved from 78 to 80 (steady activity cadence).",
    type: "SCORE_DELTA",
    severity: "INFO",
    status: "open",
    createdAt: new Date(Date.now() - 3600000 * 18),
    acknowledged: false,
    scoreDelta: 2.0,
    driver: "Steady activity cadence",
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
