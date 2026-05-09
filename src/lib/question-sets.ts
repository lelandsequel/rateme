// RMR v2 question-set catalog.
//
// 4 question sets, 10 questions each (40 questions total). Industries
// from `industries.ts` map to one of these sets via `questionSet`. The
// rating form for a rep renders this set's questions; aggregations
// iterate the dynamic answer rows. Labels are tri-lingual (en/es/pt) so
// the mobile client can show the rater's preferred locale.
//
// Stable `key` per question — used as the wire identifier in the rating
// API ({ questionKey, score }). Don't rename keys without a migration plan.

export type QuestionSetSlug =
  | "standard-sales"
  | "safety-focus"
  | "advertising-sales"
  | "inspection";

export interface QuestionSeed {
  key: string;
  labelEn: string;
  labelEs: string;
  labelPt: string;
}

export interface QuestionSetSeed {
  slug: QuestionSetSlug;
  name: string;
  questions: ReadonlyArray<QuestionSeed>;
}

// Shared questions reused across multiple sets.
const Q_PROFESSIONAL: QuestionSeed = {
  key: "is_professional",
  labelEn: "Is Professional",
  labelEs: "Es Profesional",
  labelPt: "É Profissional",
};
const Q_LISTENS: QuestionSeed = {
  key: "actively_listens",
  labelEn: "Actively Listens",
  labelEs: "Escucha Activamente",
  labelPt: "Ouve Ativamente",
};
const Q_COMMUNICATES: QuestionSeed = {
  key: "effectively_communicates",
  labelEn: "Effectively Communicates",
  labelEs: "Se Comunica Eficazmente",
  labelPt: "Comunica-se de Forma Eficaz",
};
const Q_RESPONSIVE: QuestionSeed = {
  key: "is_responsive",
  labelEn: "Is Responsive",
  labelEs: "Es Receptivo",
  labelPt: "É Responsivo",
};
const Q_RESPECTS_TIME: QuestionSeed = {
  key: "respects_my_time",
  labelEn: "Respects My Time",
  labelEs: "Respeta Mi Tiempo",
  labelPt: "Respeita o Meu Tempo",
};
const Q_RELEVANT_SOLUTIONS: QuestionSeed = {
  key: "offers_relevant_solutions",
  labelEn: "Offers Relevant Solutions",
  labelEs: "Ofrece Soluciones Relevantes",
  labelPt: "Oferece Soluções Relevantes",
};
const Q_KNOWLEDGEABLE: QuestionSeed = {
  key: "is_knowledgeable",
  labelEn: "Is Knowledgeable",
  labelEs: "Es Conocedor",
  labelPt: "É Conhecedor",
};
const Q_ACCOUNTABLE: QuestionSeed = {
  key: "is_accountable",
  labelEn: "Is Accountable",
  labelEs: "Es Responsable",
  labelPt: "É Responsável",
};
const Q_DEADLINES: QuestionSeed = {
  key: "meets_deadlines",
  labelEn: "Meets Deadlines",
  labelEs: "Cumple Con Los Plazos",
  labelPt: "Cumpre Prazos",
};
const Q_PROACTIVE: QuestionSeed = {
  key: "reaches_out_proactively",
  labelEn: "Reaches out proactively",
  labelEs: "Se Comunica de Manera Proactiva",
  labelPt: "Entra em Contato de Forma Proativa",
};
const Q_SAFETY: QuestionSeed = {
  key: "adheres_to_safety",
  labelEn: "Adheres to Protocols and Safety Procedures",
  labelEs: "Cumple con los Procedimientos de Seguridad",
  labelPt: "Cumpre os Procedimentos de Segurança",
};
const Q_TOOLS_METRICS: QuestionSeed = {
  key: "provides_tools_metrics",
  labelEn: "Provides tools/metrics to measure success",
  labelEs: "Proporciona Métricas para Medir el Exito",
  labelPt: "Fornece Métricas para Medir o Sucesso",
};

// Inspection-only questions.
const Q_TECH_ABILITY: QuestionSeed = {
  key: "demonstrates_technical_ability",
  labelEn: "Demonstrates Technical Ability",
  labelEs: "Demuestra Capacidad Técnica",
  labelPt: "Demonstra capacidade técnica",
};
const Q_CLIENT_REQUIREMENTS: QuestionSeed = {
  key: "understands_client_requirements",
  labelEn: "Understands Client Requirements",
  labelEs: "Comprende los Requisitos del Cliente",
  labelPt: "Compreende os requisitos do cliente",
};
const Q_PREPARES_MEETINGS: QuestionSeed = {
  key: "prepares_for_meetings",
  labelEn: "Prepares for our Meetings",
  labelEs: "Se Prepara para nuestras Reuniones",
  labelPt: "Prepara-se para nossas reuniões",
};
const Q_INTERPRETS_SPECS: QuestionSeed = {
  key: "interprets_specifications",
  labelEn: "Is able to Interpret Specifications",
  labelEs: "Es Capaz de Interpretar las Especificaciones",
  labelPt: "É Capaz de Interpretar as Especificações",
};
const Q_INDUSTRY_PRACTICES: QuestionSeed = {
  key: "knows_industry_practices_codes",
  labelEn: "Is Knowledgeable of Industry Practices & Codes",
  labelEs: "Posee Conocimiento de las Prácticas y Normas de la Industria",
  labelPt: "Possui Conhecimento das Práticas e Normas do Setor",
};
const Q_DEMONSTRATES_ACCOUNTABILITY: QuestionSeed = {
  key: "demonstrates_accountability",
  labelEn: "Demonstrates Accountability",
  labelEs: "Es Responsable",
  labelPt: "É Responsável",
};
const Q_DELIVERS_COMMITMENTS: QuestionSeed = {
  key: "delivers_on_commitments",
  labelEn: "Delivers on Commitments",
  labelEs: "Cumple Con Los Compromisos",
  labelPt: "Cumpre Compromissos",
};
const Q_COMMITTED_SAFETY: QuestionSeed = {
  key: "is_committed_to_safety",
  labelEn: "Is Committed to Safety",
  labelEs: "Cumple con los Procedimientos de Seguridad",
  labelPt: "Cumpre os Procedimentos de Segurança",
};

export const QUESTION_SETS_V2: ReadonlyArray<QuestionSetSeed> = [
  {
    slug: "standard-sales",
    name: "Standard Sales",
    questions: [
      Q_PROFESSIONAL,
      Q_LISTENS,
      Q_COMMUNICATES,
      Q_RESPONSIVE,
      Q_RESPECTS_TIME,
      Q_RELEVANT_SOLUTIONS,
      Q_KNOWLEDGEABLE,
      Q_ACCOUNTABLE,
      Q_DEADLINES,
      Q_PROACTIVE,
    ],
  },
  {
    slug: "safety-focus",
    name: "Safety Focus",
    questions: [
      Q_PROFESSIONAL,
      Q_LISTENS,
      Q_COMMUNICATES,
      Q_RESPONSIVE,
      Q_RESPECTS_TIME,
      Q_RELEVANT_SOLUTIONS,
      Q_KNOWLEDGEABLE,
      Q_ACCOUNTABLE,
      Q_DEADLINES,
      Q_SAFETY,
    ],
  },
  {
    slug: "advertising-sales",
    name: "Advertising Sales",
    questions: [
      Q_PROFESSIONAL,
      Q_LISTENS,
      Q_COMMUNICATES,
      Q_RESPONSIVE,
      Q_RESPECTS_TIME,
      Q_RELEVANT_SOLUTIONS,
      Q_KNOWLEDGEABLE,
      Q_TOOLS_METRICS,
      Q_DEADLINES,
      Q_PROACTIVE,
    ],
  },
  {
    slug: "inspection",
    name: "Inspection",
    questions: [
      Q_TECH_ABILITY,
      Q_CLIENT_REQUIREMENTS,
      Q_COMMUNICATES,
      Q_RESPONSIVE,
      Q_PREPARES_MEETINGS,
      Q_INTERPRETS_SPECS,
      Q_INDUSTRY_PRACTICES,
      Q_DEMONSTRATES_ACCOUNTABILITY,
      Q_DELIVERS_COMMITMENTS,
      Q_COMMITTED_SAFETY,
    ],
  },
];
