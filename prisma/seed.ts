// RMR v2 seed — Houston, TX cohort with dynamic question sets.
//
// Populates a realistic-looking starter dataset:
//   • 4 QuestionSets + 40 Questions (en/es/pt)
//   • 19 Industries linked to their QuestionSet
//   • TJ as the SALES_MANAGER (with a Houston-based team)
//   • 5 reps in Houston, varied industries (mapped to V2 industries)
//   • 10 raters in Houston, varied industries
//   • Connections: every rep ↔ several raters, mix of ACCEPTED + PENDING
//   • Ratings: each accepted connection has 1-3 Ratings; each Rating gets
//     N RatingAnswers (one per question in the rep's industry's set)
//
// Idempotent-ish: deletes everything in dependency order before re-creating.
// Safe to re-run via `npx prisma db seed` or `prisma migrate reset --seed`.

import {
  PrismaClient,
  Role,
  USState,
  ManagerType,
  ConnectionInitiator,
  ConnectionStatus,
} from "@prisma/client";
import bcrypt from "bcrypt";
import { INDUSTRIES_V2 } from "../src/lib/industries";
import { QUESTION_SETS_V2 } from "../src/lib/question-sets";

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = "demo123";

// Deterministic 1-5 score helper for seeding — varies per seed-input but
// stable across runs.
function score(seed: number, lo = 3, hi = 5): number {
  const range = hi - lo + 1;
  return lo + (Math.abs(seed) % range);
}

async function main() {
  console.log("[seed] tearing down existing rows…");

  // Order matters because of FKs. RatingAnswer cascade-deletes with Rating,
  // but we delete it explicitly so a re-run on a partial DB still works.
  await prisma.ratingAnswer.deleteMany({});
  await prisma.rating.deleteMany({});
  await prisma.ratingRequest.deleteMany({});
  await prisma.connection.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.pushToken.deleteMany({});
  await prisma.repProfile.deleteMany({});
  await prisma.raterProfile.deleteMany({});
  await prisma.managerProfile.deleteMany({});
  await prisma.favorite.deleteMany({});
  await prisma.notificationLog.deleteMany({});
  await prisma.authToken.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.industry.deleteMany({});
  await prisma.question.deleteMany({});
  await prisma.questionSet.deleteMany({});

  console.log("[seed] question sets + questions…");
  const setBySlug: Record<string, { id: string; questionsByKey: Record<string, { id: string; ord: number }> }> = {};
  for (const setSeed of QUESTION_SETS_V2) {
    const set = await prisma.questionSet.create({
      data: { slug: setSeed.slug, name: setSeed.name },
    });
    const questionsByKey: Record<string, { id: string; ord: number }> = {};
    for (let i = 0; i < setSeed.questions.length; i++) {
      const q = setSeed.questions[i];
      const created = await prisma.question.create({
        data: {
          questionSetId: set.id,
          ord: i,
          key: q.key,
          labelEn: q.labelEn,
          labelEs: q.labelEs,
          labelPt: q.labelPt,
        },
      });
      questionsByKey[q.key] = { id: created.id, ord: i };
    }
    setBySlug[setSeed.slug] = { id: set.id, questionsByKey };
  }

  console.log("[seed] industries…");
  for (const ind of INDUSTRIES_V2) {
    await prisma.industry.create({
      data: {
        name: ind.name,
        slug: ind.slug,
        questionSetId: setBySlug[ind.questionSet].id,
      },
    });
  }
  const industriesBySlug = Object.fromEntries(
    (await prisma.industry.findMany()).map((i) => [i.slug, i]),
  );

  // Map of industrySlug → questionSet questionsByKey, used when creating
  // RatingAnswer rows for a rep's industry.
  const questionsByIndustry = (industrySlug: string) => {
    const ind = INDUSTRIES_V2.find((i) => i.slug === industrySlug);
    if (!ind) throw new Error(`industry not in V2 list: ${industrySlug}`);
    return setBySlug[ind.questionSet];
  };

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
      emailVerifiedAt: new Date(),
      managerProfile: {
        create: {
          managesType: ManagerType.REP_MANAGER,
          company: "RateMyRep",
        },
      },
    },
  });

  // -----------------------------------------------------------------------
  // 5 Reps in Houston, mapped to V2 industries (the v1 industries no longer
  // exist; pick the closest V2 equivalent).
  // -----------------------------------------------------------------------
  console.log("[seed] reps…");
  const repSpecs = [
    // industrial-equipment → manufacturing
    { email: "alayna.steinman@example.com", name: "Alayna Steinman", title: "Senior Account Executive", company: "Sequel Industrial",       industrySlug: "manufacturing" },
    // energy-oil-gas → energy
    { email: "marcus.hill@example.com",     name: "Marcus Hill",     title: "Account Executive",        company: "Bayou Energy Partners",   industrySlug: "energy" },
    // saas → information-technology
    { email: "priya.shah@example.com",      name: "Priya Shah",      title: "Enterprise AE",            company: "Lonestar SaaS",           industrySlug: "information-technology" },
    // medical-devices → medical
    { email: "diego.fuentes@example.com",   name: "Diego Fuentes",   title: "Regional Sales Manager",   company: "GulfMed Devices",         industrySlug: "medical" },
    // logistics-supply-chain → services
    { email: "rachel.boudreaux@example.com", name: "Rachel Boudreaux", title: "Account Executive",      company: "Houston Logistics Co.",   industrySlug: "services" },
  ];

  // Sanity check: every rep's industry maps to a known question set.
  for (const r of repSpecs) {
    const map = questionsByIndustry(r.industrySlug);
    if (!map) throw new Error(`no question set mapped for industry ${r.industrySlug}`);
  }

  const reps = [];
  for (const spec of repSpecs) {
    const u = await prisma.user.create({
      data: {
        email: spec.email,
        name: spec.name,
        passwordHash,
        role: Role.REP,
        state: USState.TX,
        emailVerifiedAt: new Date(),
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
    reps.push({ user: u, industrySlug: spec.industrySlug });
  }

  // Add all 5 reps to TJ's team.
  for (const rep of reps) {
    await prisma.teamMembership.create({
      data: {
        managerId: tj.id,
        memberId: rep.user.id,
        acceptedAt: new Date(),
      },
    });
  }

  // -----------------------------------------------------------------------
  // 10 Raters in Houston (their customers). Industry doesn't drive a
  // question set for raters (raters AUTHOR ratings; the question set comes
  // from the REP's industry at submit time), but they still need a valid
  // industry for the FK.
  // -----------------------------------------------------------------------
  console.log("[seed] raters…");
  const raterSpecs = [
    { email: "jared.payne@procureco.com",         name: "Jared Payne",      title: "VP of Procurement",       company: "ProCureCo",              industrySlug: "manufacturing" },
    { email: "samantha.li@petrofirst.com",        name: "Samantha Li",      title: "Director of Operations",  company: "PetroFirst",             industrySlug: "energy" },
    { email: "kenji.morrison@stratusclinics.com", name: "Kenji Morrison",   title: "Chief of Staff",          company: "Stratus Clinics",        industrySlug: "medical" },
    { email: "naomi.ramos@blueoxide.io",          name: "Naomi Ramos",      title: "Head of Engineering",     company: "BlueOxide",              industrySlug: "information-technology" },
    { email: "graham.lee@coastalfreight.com",     name: "Graham Lee",       title: "Logistics Manager",       company: "Coastal Freight",        industrySlug: "services" },
    { email: "ines.alvarez@meridian-mfg.com",     name: "Inés Alvarez",     title: "Plant Manager",           company: "Meridian Manufacturing", industrySlug: "manufacturing" },
    { email: "owen.bradley@ironforge.co",         name: "Owen Bradley",     title: "Director of Procurement", company: "IronForge Construction", industrySlug: "construction" },
    { email: "yuki.tanaka@gulfmedclinic.com",     name: "Yuki Tanaka",      title: "VP of Clinical Ops",      company: "Gulf Med Clinic",        industrySlug: "medical" },
    { email: "trevor.okonkwo@bayoucapital.com",   name: "Trevor Okonkwo",   title: "Managing Partner",        company: "Bayou Capital",          industrySlug: "finance" },
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
        emailVerifiedAt: new Date(),
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
    connectionsByRep[rep.user.id] = [];

    for (let i = 0; i < pickCount; i++) {
      const rater = raters[(r + i * 2) % raters.length];
      const seed = r * 11 + i * 13;
      let status: ConnectionStatus;
      if (seed % 10 < 7) {
        status = ConnectionStatus.ACCEPTED;
      } else if (seed % 10 < 9) {
        status = ConnectionStatus.PENDING;
      } else {
        status = ConnectionStatus.REJECTED;
      }

      // Idempotent: skip if (rep, rater) already exists in this loop.
      if (connectionsByRep[rep.user.id].some((c) => c.raterId === rater.id)) continue;

      const conn = await prisma.connection.create({
        data: {
          repUserId: rep.user.id,
          raterUserId: rater.id,
          initiatedBy: i % 2 === 0 ? ConnectionInitiator.RATER : ConnectionInitiator.REP,
          status,
          requestedAt: new Date(Date.now() - (10 + seed) * 24 * 60 * 60 * 1000),
          respondedAt: status === ConnectionStatus.PENDING ? null : new Date(Date.now() - seed * 60 * 60 * 1000),
        },
      });
      if (status === ConnectionStatus.ACCEPTED) connectionsAccepted++;
      else if (status === ConnectionStatus.PENDING) connectionsPending++;
      else if (status === ConnectionStatus.REJECTED) connectionsRejected++;
      connectionsByRep[rep.user.id].push({ raterId: rater.id, status, connectionId: conn.id });
    }
  }

  // -----------------------------------------------------------------------
  // Ratings — every accepted connection gets 1-3 ratings. Each rating gets
  // one RatingAnswer per question in the rep's industry's question set.
  // -----------------------------------------------------------------------
  console.log("[seed] ratings + answers…");
  let ratingCount = 0;
  let answerCount = 0;
  for (const rep of reps) {
    const setMap = questionsByIndustry(rep.industrySlug);
    const questionEntries = Object.entries(setMap.questionsByKey); // [key, {id, ord}]

    const conns = connectionsByRep[rep.user.id].filter((c) => c.status === ConnectionStatus.ACCEPTED);
    let r = 0;
    for (const conn of conns) {
      const ratingsForThisPair = 1 + (r % 3); // 1, 2, or 3
      for (let i = 0; i < ratingsForThisPair; i++) {
        const seed = (rep.user.id.charCodeAt(0) + r * 31 + i * 7) >>> 0;
        const created = await prisma.rating.create({
          data: {
            connectionId: conn.connectionId,
            repUserId: rep.user.id,
            raterUserId: conn.raterId,
            createdAt: new Date(Date.now() - (i * 14 + r * 5) * 24 * 60 * 60 * 1000),
            answers: {
              create: questionEntries.map(([, q], qi) => ({
                questionId: q.id,
                score: score(seed + qi),
              })),
            },
          },
          include: { answers: true },
        });
        ratingCount++;
        answerCount += created.answers.length;
      }
      r++;
    }
  }

  console.log("[seed] done");
  console.log(`        question sets:        ${QUESTION_SETS_V2.length}`);
  console.log(`        questions:            ${QUESTION_SETS_V2.reduce((acc, s) => acc + s.questions.length, 0)}`);
  console.log(`        industries:           ${INDUSTRIES_V2.length}`);
  console.log(`        users:                ${1 + reps.length + raters.length}  (1 mgr, ${reps.length} reps, ${raters.length} raters)`);
  console.log(`        connections accepted: ${connectionsAccepted}`);
  console.log(`        connections pending:  ${connectionsPending}`);
  console.log(`        connections rejected: ${connectionsRejected}`);
  console.log(`        ratings:              ${ratingCount}`);
  console.log(`        rating answers:       ${answerCount}`);
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
