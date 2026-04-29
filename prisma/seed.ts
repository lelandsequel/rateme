/**
 * Idempotent seed for the RATE ME demo tenant.
 *
 * Creates:
 *   - 1 tenant (Demo Org, slug=demo)
 *   - 4 users (1 admin, 3 managers) with hashed passwords
 *   - 3 teams
 *   - 8 reps with REP_SCORE rows baked in
 *   - ~15 sessions per rep across last 30 days
 *   - 5 alerts
 *   - 3 benchmarks
 *
 * Run: `npx prisma db seed`
 *
 * Idempotent strategy: every entity uses a deterministic id so re-runs upsert
 * cleanly without piling up duplicates.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

// Determinstic ids for re-runs.
const TENANT_ID = "tenant-demo";
const TEAM_IDS = {
  east: "team-sales-east",
  west: "team-sales-west",
  central: "team-sales-central",
} as const;

const USER_DEFS = [
  { id: "user-admin", email: "admin@demo.com", name: "Demo Admin", role: "ADMIN" },
  { id: "user-mgr-1", email: "manager1@demo.com", name: "Mara Castillo", role: "MANAGER" },
  { id: "user-mgr-2", email: "manager2@demo.com", name: "Henrik Voss", role: "MANAGER" },
  { id: "user-mgr-3", email: "manager3@demo.com", name: "Yuki Tanaka", role: "MANAGER" },
] as const;

interface RepDef {
  id: string;
  name: string;
  email: string;
  title: string;
  department: string;
  teamId: string;
  hireDate: Date;
  /** Target band; the seeded score will fall in that range. */
  targetBand: "thriving" | "steady" | "watch" | "at-risk";
}

const REPS: RepDef[] = [
  { id: "rep-1", name: "Elena Vance",       email: "elena.vance@demo.com",     title: "Senior AE",       department: "Enterprise Sales", teamId: TEAM_IDS.east,    hireDate: new Date("2022-03-15"), targetBand: "thriving" },
  { id: "rep-2", name: "Priya Okonkwo",     email: "priya.okonkwo@demo.com",   title: "Sales Manager",   department: "Enterprise Sales", teamId: TEAM_IDS.east,    hireDate: new Date("2021-06-01"), targetBand: "thriving" },
  { id: "rep-3", name: "Sofia Delgado",     email: "sofia.delgado@demo.com",   title: "Enterprise AE",   department: "Enterprise Sales", teamId: TEAM_IDS.west,    hireDate: new Date("2022-11-03"), targetBand: "thriving" },
  { id: "rep-4", name: "Marcus Webb",       email: "marcus.webb@demo.com",     title: "Account Executive", department: "Mid-Market",     teamId: TEAM_IDS.west,    hireDate: new Date("2023-01-10"), targetBand: "thriving" },
  { id: "rep-5", name: "Daniela Park",      email: "daniela.park@demo.com",    title: "Account Executive", department: "Mid-Market",     teamId: TEAM_IDS.central, hireDate: new Date("2024-06-01"), targetBand: "steady"   },
  { id: "rep-6", name: "Theo Jin",          email: "theo.jin@demo.com",        title: "Account Executive", department: "Mid-Market",     teamId: TEAM_IDS.central, hireDate: new Date("2023-09-15"), targetBand: "watch"    },
  { id: "rep-7", name: "Ada Sørensen",      email: "ada.sorensen@demo.com",    title: "Account Executive", department: "SMB",            teamId: TEAM_IDS.west,    hireDate: new Date("2024-09-12"), targetBand: "watch"    },
  { id: "rep-8", name: "James Holloway",    email: "james.holloway@demo.com",  title: "Account Executive", department: "SMB",            teamId: TEAM_IDS.central, hireDate: new Date("2023-07-20"), targetBand: "at-risk"  },
];

function bandToScore(band: RepDef["targetBand"]): number {
  switch (band) {
    case "thriving": return 90 + Math.floor(Math.random() * 8); // 90-97
    case "steady":   return 78 + Math.floor(Math.random() * 7); // 78-84
    case "watch":    return 62 + Math.floor(Math.random() * 8); // 62-69
    case "at-risk":  return 40 + Math.floor(Math.random() * 15); // 40-54
  }
}

const ALERTS = [
  { id: "alert-1", type: "SCORE_DROP",     severity: "WARNING",  title: "Score Drop Detected",
    message: "James Holloway dropped 2.7 points this week. Coaching recommended." },
  { id: "alert-2", type: "ANOMALY",        severity: "CRITICAL", title: "Anomaly: Call Duration Spike",
    message: "Marcus Webb's average call duration increased 140% — review required." },
  { id: "alert-3", type: "MILESTONE",      severity: "INFO",     title: "Milestone: Elena Vance hits 94",
    message: "Elena Vance has crossed the 94-point threshold for the first time.", acknowledged: true },
  { id: "alert-4", type: "LOW_CONFIDENCE", severity: "WARNING",  title: "Low Confidence Score",
    message: "Sofia Delgado's confidence score fell below 80%. More session data needed." },
  { id: "alert-5", type: "SCORE_DROP",     severity: "INFO",     title: "Team Score Trending Down",
    message: "Sales — Central avg score dipped 1.4 points week-over-week." },
] as const;

const BENCHMARKS = [
  { id: "bench-1", name: "Top Performer Threshold", type: "threshold",
    formula: "score >= 90",
    thresholds: JSON.stringify({ excellent: 90, good: 80, needsImprovement: 70 }) },
  { id: "bench-2", name: "Confidence Floor",        type: "threshold",
    formula: "confidence >= 0.80",
    thresholds: JSON.stringify({ excellent: 0.90, good: 0.80, needsImprovement: 0.65 }) },
  { id: "bench-3", name: "Weekly Score Growth",     type: "growth",
    formula: "(currentScore - prevScore) / prevScore",
    thresholds: JSON.stringify({ excellent: 5, good: 2, needsImprovement: 0 }) },
] as const;

async function main() {
  console.log("[seed] starting");

  // ---- Tenant ---------------------------------------------------------
  const tenant = await prisma.tENANT.upsert({
    where: { id: TENANT_ID },
    update: { name: "Demo Org" },
    create: { id: TENANT_ID, name: "Demo Org", slug: "demo" },
  });
  console.log(`[seed] tenant: ${tenant.name} (${tenant.id})`);

  // ---- Users ----------------------------------------------------------
  const passwordHash = await bcrypt.hash("demo123", 10);
  for (const u of USER_DEFS) {
    await prisma.uSER.upsert({
      where: { id: u.id },
      update: { email: u.email, name: u.name, role: u.role, passwordHash },
      create: {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        passwordHash,
        tenantId: TENANT_ID,
      },
    });
  }
  console.log(`[seed] users: ${USER_DEFS.length}`);

  // ---- Teams ----------------------------------------------------------
  const teamDefs = [
    { id: TEAM_IDS.east,    name: "Sales — East",    description: "Enterprise accounts, eastern region." },
    { id: TEAM_IDS.west,    name: "Sales — West",    description: "Mid-market and SMB accounts, western region." },
    { id: TEAM_IDS.central, name: "Sales — Central", description: "Strategic accounts across central markets." },
  ];
  for (const t of teamDefs) {
    await prisma.tEAM.upsert({
      where: { id: t.id },
      update: { name: t.name, description: t.description },
      create: { id: t.id, name: t.name, description: t.description, tenantId: TENANT_ID },
    });
  }
  console.log(`[seed] teams: ${teamDefs.length}`);

  // ---- Reps -----------------------------------------------------------
  for (const r of REPS) {
    await prisma.rEP.upsert({
      where: { id: r.id },
      update: {
        name: r.name,
        email: r.email,
        title: r.title,
        department: r.department,
        teamId: r.teamId,
        hireDate: r.hireDate,
        status: "ACTIVE",
      },
      create: {
        id: r.id,
        name: r.name,
        email: r.email,
        title: r.title,
        department: r.department,
        teamId: r.teamId,
        hireDate: r.hireDate,
        status: "ACTIVE",
        tenantId: TENANT_ID,
      },
    });
  }
  console.log(`[seed] reps: ${REPS.length}`);

  // ---- Score history (4 weekly points per rep, including current) -----
  // Wipe the rep's existing baked scores first so reseeding is clean.
  await prisma.rEP_SCORE.deleteMany({
    where: { rep: { tenantId: TENANT_ID }, dimension: "overall" },
  });
  const now = Date.now();
  for (const r of REPS) {
    const targetScore = bandToScore(r.targetBand);
    for (let week = 3; week >= 0; week--) {
      const drift = (Math.random() - 0.5) * 4;
      const score = Math.max(0, Math.min(100, Math.round(targetScore + drift)));
      const confidence =
        r.targetBand === "at-risk"
          ? 0.62 + Math.random() * 0.1
          : 0.78 + Math.random() * 0.18;
      await prisma.rEP_SCORE.create({
        data: {
          repId: r.id,
          score,
          confidence: Math.round(confidence * 100) / 100,
          dimension: "overall",
          period: r.targetBand,
          calculatedAt: new Date(now - week * 7 * 86_400_000),
        },
      });
    }
  }
  console.log(`[seed] rep scores: ${REPS.length * 4}`);

  // ---- Sessions (~15 per rep across last 30 days) ---------------------
  await prisma.sESSION.deleteMany({ where: { tenantId: TENANT_ID } });
  const sessionTypes = ["CALL", "DEMO", "MEETING"];
  const sessionTitles = [
    "Discovery Call", "Follow-up Demo", "Renewal Discussion",
    "Quarterly Business Review", "Technical Deep Dive", "Pricing Conversation",
    "Intro Call", "Stakeholder Sync", "Pilot Kickoff",
  ];
  let sessionCount = 0;
  for (const r of REPS) {
    const n = 12 + Math.floor(Math.random() * 6); // 12-17
    for (let i = 0; i < n; i++) {
      const daysAgo = Math.floor(Math.random() * 30);
      const sentimentBase = r.targetBand === "thriving" ? 0.75
        : r.targetBand === "steady"   ? 0.6
        : r.targetBand === "watch"    ? 0.5
        : 0.35;
      const sentiment = Math.max(0, Math.min(1, sentimentBase + (Math.random() - 0.5) * 0.3));
      await prisma.sESSION.create({
        data: {
          tenantId: TENANT_ID,
          repId: r.id,
          type: sessionTypes[i % sessionTypes.length],
          title: `${sessionTitles[i % sessionTitles.length]} #${i + 1}`,
          sentiment: Math.round(sentiment * 100) / 100,
          startedAt: new Date(now - daysAgo * 86_400_000),
          endedAt: new Date(now - daysAgo * 86_400_000 + 3_600_000),
        },
      });
      sessionCount++;
    }
  }
  console.log(`[seed] sessions: ${sessionCount}`);

  // ---- Alerts ---------------------------------------------------------
  for (const a of ALERTS) {
    const acknowledged = "acknowledged" in a ? a.acknowledged : false;
    await prisma.aLERT.upsert({
      where: { id: a.id },
      update: {
        type: a.type, severity: a.severity, title: a.title, message: a.message,
        acknowledged,
      },
      create: {
        id: a.id,
        type: a.type, severity: a.severity, title: a.title, message: a.message,
        acknowledged,
        tenantId: TENANT_ID,
      },
    });
  }
  console.log(`[seed] alerts: ${ALERTS.length}`);

  // ---- Benchmarks -----------------------------------------------------
  for (const b of BENCHMARKS) {
    await prisma.bENCHMARK.upsert({
      where: { id: b.id },
      update: { name: b.name, type: b.type, formula: b.formula, thresholds: b.thresholds },
      create: {
        id: b.id, name: b.name, type: b.type, formula: b.formula, thresholds: b.thresholds,
        tenantId: TENANT_ID,
      },
    });
  }
  console.log(`[seed] benchmarks: ${BENCHMARKS.length}`);

  console.log("[seed] done");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error("[seed] failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
