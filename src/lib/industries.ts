// RMR v2 industry taxonomy.
//
// Replaces the v1 ~20-entry list with a 19-entry curated list where each
// industry is tagged with its `questionSet` slug. Seed + signup pickers
// drive off this list; the question set tag tells the rating form which
// 10 questions to render for a rep in that industry.
//
// `slug` is the stable identifier used in URLs / API queries.
// `name` is the human-facing label shown in pickers + on profiles.

export type QuestionSetSlug =
  | "standard-sales"
  | "safety-focus"
  | "advertising-sales"
  | "inspection";

export interface IndustryEntry {
  slug: string;
  name: string;
  questionSet: QuestionSetSlug;
}

export const INDUSTRIES_V2: ReadonlyArray<IndustryEntry> = [
  // STANDARD SALES (11)
  { slug: "home-improvement",       name: "Home Improvement",       questionSet: "standard-sales" },
  { slug: "education",              name: "Education",              questionSet: "standard-sales" },
  { slug: "hospitality",            name: "Hospitality",            questionSet: "standard-sales" },
  { slug: "information-technology", name: "Information Technology", questionSet: "standard-sales" },
  { slug: "insurance",              name: "Insurance",              questionSet: "standard-sales" },
  { slug: "finance",                name: "Finance",                questionSet: "standard-sales" },
  { slug: "retail",                 name: "Retail",                 questionSet: "standard-sales" },
  { slug: "telecommunications",     name: "Telecommunications",     questionSet: "standard-sales" },
  { slug: "services",               name: "Services",               questionSet: "standard-sales" },
  { slug: "pharmaceutical",         name: "Pharmaceutical",         questionSet: "standard-sales" },
  { slug: "other",                  name: "Other",                  questionSet: "standard-sales" },
  // SAFETY FOCUS (5)
  { slug: "automotive",             name: "Automotive",             questionSet: "safety-focus" },
  { slug: "construction",           name: "Construction",           questionSet: "safety-focus" },
  { slug: "manufacturing",          name: "Manufacturing",          questionSet: "safety-focus" },
  { slug: "medical",                name: "Medical",                questionSet: "safety-focus" },
  { slug: "energy",                 name: "Energy",                 questionSet: "safety-focus" },
  // ADVERTISING SALES (1)
  { slug: "marketing",              name: "Marketing",              questionSet: "advertising-sales" },
  // INSPECTION (2)
  { slug: "inspection",             name: "Inspection",             questionSet: "inspection" },
  { slug: "contractor",             name: "Contractor",             questionSet: "inspection" },
] as const;
