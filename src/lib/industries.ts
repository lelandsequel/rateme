// RMR v1 industry taxonomy.
//
// Curated for sales-rep-relevant verticals. ~20 entries — broad enough that
// most real reps fit, narrow enough that filtering is meaningful. TJ to
// redline; treat this as a starting point, not the canonical list.
//
// `slug` is the stable identifier used in URLs / API queries.
// `name` is the human-facing label shown in pickers + on profiles.

export interface IndustryEntry {
  slug: string;
  name: string;
}

export const INDUSTRIES_V1: ReadonlyArray<IndustryEntry> = [
  { slug: "saas",                  name: "SaaS / Software" },
  { slug: "manufacturing",         name: "Manufacturing" },
  { slug: "industrial-equipment",  name: "Industrial Equipment" },
  { slug: "healthcare",            name: "Healthcare" },
  { slug: "medical-devices",       name: "Medical Devices" },
  { slug: "pharma-biotech",        name: "Pharma / Biotech" },
  { slug: "financial-services",    name: "Financial Services" },
  { slug: "insurance",             name: "Insurance" },
  { slug: "real-estate-commercial", name: "Commercial Real Estate" },
  { slug: "construction",          name: "Construction" },
  { slug: "energy-oil-gas",        name: "Energy / Oil & Gas" },
  { slug: "logistics-supply-chain", name: "Logistics / Supply Chain" },
  { slug: "telecom",               name: "Telecommunications" },
  { slug: "media-advertising",     name: "Media / Advertising" },
  { slug: "professional-services", name: "Professional Services" },
  { slug: "staffing-recruiting",   name: "Staffing / Recruiting" },
  { slug: "automotive",            name: "Automotive" },
  { slug: "consumer-goods",        name: "Consumer Goods" },
  { slug: "food-beverage",         name: "Food & Beverage" },
  { slug: "education",             name: "Education / EdTech" },
  { slug: "other",                 name: "Other" },
];
