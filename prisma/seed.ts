// RMR v1 seed — Houston, TX cohort.
//
// Populates a realistic-looking starter dataset:
//   • Industry lookup (~20 entries from src/lib/industries.ts)
//   • TJ as the SALES_MANAGER (with a Houston-based team)
//   • 5 reps in Houston, varied industries
//   • 10 raters in Houston, varied industries
//   • Connections: every rep ↔ several raters, mix of ACCEPTED + PENDING
//   • Ratings: each accepted connection has 1-3 ratings
//
// Idempotent-ish: deletes everything in dependency order before re-creating.
// Safe to re-run via `npx prisma db seed` or `prisma migrate reset --seed`.

import { PrismaClient, Role, USState, ManagerType, ConnectionInitiator, ConnectionStatus } from "@prisma/client";
import bcrypt from "bcrypt";
import { INDUSTRIES_V1 } from "../src/lib/industries";

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = "demo123";

// Deterministic 1-5 score helper for seeding — varies per seed-input but
// stable across runs.
function score(seed: number, lo = 3, hi = 5): number {
  const range = hi - lo + 1;
  return lo + (seed % range);
}

async function main() {
  console.log("[seed] tearing down existing rows…");

  // Order matters because of FKs.
  await prisma.rating.deleteMany({});
  await prisma.ratingRequest.deleteMany({});
  await prisma.connection.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.pushToken.deleteMany({});
  await prisma.repProfile.deleteMany({});
  await prisma.raterProfile.deleteMany({});
  await prisma.managerProfile.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.industry.deleteMany({});

  console.log("[seed] industries…");
  for (const ind of INDUSTRIES_V1) {
    await prisma.industry.create({
      data: { name: ind.name, slug: ind.slug },
    });
  }
  const industriesBySlug = Object.fromEntries(
    (await prisma.industry.findMany()).map((i) => [i.slug, i]),
  );

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  // -----------------------------------------------------------------------
  // TJ — the sales manager.
  // -----------------------------------------------------------------------
  console.log("[seed] TJ (sales manager)…");
  const tj = await prisma.user.create({
    data: {
      email: "tj@ratemyrep.com",
      name: "TJ",
      passwordHash,
      role: Role.SALES_MANAGER,
      state: USState.TX,
      managerProfile: {
        create: {
          managesType: ManagerType.REP_MANAGER,
          company: "RateMyRep",
        },
      },
    },
  });

  // -----------------------------------------------------------------------
  // 5 Reps in Houston, varied industries.
  // -----------------------------------------------------------------------
  console.log("[seed] reps…");
  const repSpecs = [
    { email: "alayna.steinman@example.com", name: "Alayna Steinman", title: "Senior Account Executive", company: "Sequel Industrial",       industrySlug: "industrial-equipment" },
    { email: "marcus.hill@example.com",     name: "Marcus Hill",     title: "Account Executive",        company: "Bayou Energy Partners",   industrySlug: "energy-oil-gas" },
    { email: "priya.shah@example.com",      name: "Priya Shah",      title: "Enterprise AE",            company: "Lonestar SaaS",           industrySlug: "saas" },
    { email: "diego.fuentes@example.com",   name: "Diego Fuentes",   title: "Regional Sales Manager",   company: "GulfMed Devices",         industrySlug: "medical-devices" },
    { email: "rachel.boudreaux@example.com", name: "Rachel Boudreaux", title: "Account Executive",      company: "Houston Logistics Co.",   industrySlug: "logistics-supply-chain" },
  ];

  const reps = [];
  for (const spec of repSpecs) {
    const u = await prisma.user.create({
      data: {
        email: spec.email,
        name: spec.name,
        passwordHash,
        role: Role.REP,
        state: USState.TX,
        repProfile: {
          create: {
            title: spec.title,
            company: spec.company,
            industryId: industriesBySlug[spec.industrySlug].id,
            metroArea: "Houston, TX",
          },
        },
      },
    });
    reps.push(u);
  }

  // Add all 5 reps to TJ's team.
  for (const rep of reps) {
    await prisma.teamMembership.create({
      data: {
        managerId: tj.id,
        memberId: rep.id,
        acceptedAt: new Date(),
      },
    });
  }

  // -----------------------------------------------------------------------
  // 10 Raters in Houston (their customers).
  // -----------------------------------------------------------------------
  console.log("[seed] raters…");
  const raterSpecs = [
    { email: "jared.payne@procureco.com",         name: "Jared Payne",      title: "VP of Procurement",       company: "ProCureCo",              industrySlug: "industrial-equipment" },
    { email: "samantha.li@petrofirst.com",        name: "Samantha Li",      title: "Director of Operations",  company: "PetroFirst",             industrySlug: "energy-oil-gas" },
    { email: "kenji.morrison@stratusclinics.com", name: "Kenji Morrison",   title: "Chief of Staff",          company: "Stratus Clinics",        industrySlug: "healthcare" },
    { email: "naomi.ramos@blueoxide.io",          name: "Naomi Ramos",      title: "Head of Engineering",     company: "BlueOxide",              industrySlug: "saas" },
    { email: "graham.lee@coastalfreight.com",     name: "Graham Lee",       title: "Logistics Manager",       company: "Coastal Freight",        industrySlug: "logistics-supply-chain" },
    { email: "ines.alvarez@meridian-mfg.com",     name: "Inés Alvarez",     title: "Plant Manager",           company: "Meridian Manufacturing", industrySlug: "manufacturing" },
    { email: "owen.bradley@ironforge.co",         name: "Owen Bradley",     title: "Director of Procurement", company: "IronForge Construction", industrySlug: "construction" },
    { email: "yuki.tanaka@gulfmedclinic.com",     name: "Yuki Tanaka",      title: "VP of Clinical Ops",      company: "Gulf Med Clinic",        industrySlug: "healthcare" },
    { email: "trevor.okonkwo@bayoucapital.com",   name: "Trevor Okonkwo",   title: "Managing Partner",        company: "Bayou Capital",          industrySlug: "financial-services" },
    { email: "elena.cruz@harborinsure.com",       name: "Elena Cruz",       title: "Underwriting Director",   company: "Harbor Insurance",       industrySlug: "insurance" },
  ];

  const raters = [];
  for (const spec of raterSpecs) {
    const u = await prisma.user.create({
      data: {
        email: spec.email,
        name: spec.name,
        passwordHash,
        role: Role.RATER,
        state: USState.TX,
        raterProfile: {
          create: {
            title: spec.title,
            company: spec.company,
            industryId: industriesBySlug[spec.industrySlug].id,
          },
        },
      },
    });
    raters.push(u);
  }

  // -----------------------------------------------------------------------
  // Connections — each rep gets connected to a varied set of raters.
  // -----------------------------------------------------------------------
  console.log("[seed] connections…");
  let connectionsAccepted = 0;
  let connectionsPending = 0;
  let connectionsRejected = 0;
  const connectionsByRep: Record<string, Array<{ raterId: string; status: ConnectionStatus; connectionId: string }>> = {};

  for (let r = 0; r < reps.length; r++) {
    const rep = reps[r];
    const pickCount = 5 + (r % 3); // 5, 6, or 7
    connectionsByRep[rep.id] = [];

    for (let i = 0; i < pickCount; i++) {
      const rater = raters[(r + i * 2) % raters.length];
      const seed = r * 11 + i * 13;
      let status: ConnectionStatus;
      if (seed % 10 < 7) {
        status = ConnectionStatus.ACCEPTED;
        connectionsAccepted++;
      } else if (seed % 10 < 9) {
        status = ConnectionStatus.PENDING;
        connectionsPending++;
      } else {
        status = ConnectionStatus.REJECTED;
        connectionsRejected++;
      }

      // Idempotent: skip if (rep, rater) already exists in this loop.
      if (connectionsByRep[rep.id].some((c) => c.raterId === rater.id)) continue;

      const conn = await prisma.connection.create({
        data: {
          repUserId: rep.id,
          raterUserId: rater.id,
          initiatedBy: i % 2 === 0 ? ConnectionInitiator.RATER : ConnectionInitiator.REP,
          status,
          requestedAt: new Date(Date.now() - (10 + seed) * 24 * 60 * 60 * 1000),
          respondedAt: status === ConnectionStatus.PENDING ? null : new Date(Date.now() - seed * 60 * 60 * 1000),
        },
      });
      connectionsByRep[rep.id].push({ raterId: rater.id, status, connectionId: conn.id });
    }
  }

  // -----------------------------------------------------------------------
  // Ratings — every accepted connection gets 1-3 ratings.
  // -----------------------------------------------------------------------
  console.log("[seed] ratings…");
  let ratingCount = 0;
  for (const rep of reps) {
    const conns = connectionsByRep[rep.id].filter((c) => c.status === ConnectionStatus.ACCEPTED);
    let r = 0;
    for (const conn of conns) {
      const ratingsForThisPair = 1 + (r % 3); // 1, 2, or 3
      for (let i = 0; i < ratingsForThisPair; i++) {
        const seed = (rep.id.charCodeAt(0) + r + i) >>> 0;
        await prisma.rating.create({
          data: {
            connectionId: conn.connectionId,
            repUserId: rep.id,
            raterUserId: conn.raterId,
            responsiveness:    score(seed),
            productKnowledge:  score(seed + 1),
            followThrough:     score(seed + 2),
            listeningNeedsFit: score(seed + 3),
            trustIntegrity:    score(seed + 4),
            takeCallAgain:     seed % 7 !== 0, // ~85% yes
            createdAt: new Date(Date.now() - (i * 14 + r * 5) * 24 * 60 * 60 * 1000),
          },
        });
        ratingCount++;
      }
      r++;
    }
  }

  console.log("[seed] done");
  console.log(`        industries:           ${INDUSTRIES_V1.length}`);
  console.log(`        users:                ${1 + reps.length + raters.length}  (1 mgr, ${reps.length} reps, ${raters.length} raters)`);
  console.log(`        connections accepted: ${connectionsAccepted}`);
  console.log(`        connections pending:  ${connectionsPending}`);
  console.log(`        connections rejected: ${connectionsRejected}`);
  console.log(`        ratings:              ${ratingCount}`);
  console.log(``);
  console.log(`        login: tj@ratemyrep.com / ${DEFAULT_PASSWORD}`);
  console.log(`        login: <any rep email> / ${DEFAULT_PASSWORD}`);
  console.log(`        login: <any rater email> / ${DEFAULT_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
