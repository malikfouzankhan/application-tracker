import { z } from "zod";

// Search preferences. Stored one row per key in `preferences` (value = jsonb); missing
// keys fall back to these defaults. Drives the prefilter and Claude's scoring.

const term = z.string().trim().min(1).max(80);

export const preferencesSchema = z
  .object({
    /** Title must contain one of these (case-insensitive, word match). */
    role_keywords: z.array(term).max(100),
    /** Title must not contain any of these. */
    title_exclusions: z.array(term).max(100),
    /** When false, titles containing "intern"/"internship" are excluded. */
    include_internships: z.boolean(),
    /** Location terms that pass (city names, "pan india", ...). */
    locations: z.array(term).max(50),
    /** Remote roles pass unless they name a non-India region. */
    allow_remote_india: z.boolean(),
    /**
     * Minimum years of experience a job may ask for, per tier. Jobs asking more than
     * stretch_max are discarded in code (dream companies get 2 extra years).
     */
    exp_bands: z
      .object({
        fit_max: z.number().int().min(0).max(30),
        justify_max: z.number().int().min(0).max(30),
        stretch_max: z.number().int().min(0).max(30),
      })
      .strict(),
    /** Company names to drop (case-insensitive exact match). */
    excluded_companies: z.array(term).max(200),
    /** Skills and topics of interest, for Claude's scoring. */
    keywords: z.array(term).max(100),
  })
  .strict();

export type Preferences = z.infer<typeof preferencesSchema>;
export type PreferenceKey = keyof Preferences;

export const DEFAULT_PREFERENCES: Preferences = {
  role_keywords: [
    "full stack",
    "fullstack",
    "backend",
    "back end",
    "frontend",
    "front end",
    "software engineer",
    "software developer",
    "software development engineer",
    "sde",
    "sde 1",
    "sde i",
    "web developer",
    "application developer",
    "developer",
    "product engineer",
    "platform engineer",
    "ai engineer",
    "ai/ml engineer",
    "llm engineer",
    "genai",
    "llm",
    "mern",
    "react",
    "node",
    "typescript",
  ],
  title_exclusions: [
    "senior",
    "sr",
    "staff",
    "principal",
    "lead",
    "manager",
    "director",
    "head",
    "vp",
    "vice president",
    "architect",
    "chief",
    "expert",
    "distinguished",
    "fellow",
    // Outside MFK's stack (JS/TS, React, Next.js, Node, NestJS, Postgres, MongoDB, LLM APIs)
    "android",
    "ios",
    "mobile",
    "flutter",
    "react native",
    "embedded",
    "firmware",
    "hardware",
    "fpga",
    "asic",
    "silicon",
    "mechanical",
    "electrical",
    "civil",
    "chemical",
    "salesforce",
    "servicenow",
    "sap",
    "abap",
    "oracle",
    "mainframe",
    "cobol",
    "dotnet",
    ".net",
    "c#",
    "java",
    "golang",
    "rust",
    "scala",
    "kotlin",
    "swift",
    "unity",
    "unreal",
    "game",
    "qa",
    "sdet",
    "test",
    "tester",
    "testing",
    "quality",
    "data scientist",
    "data analyst",
    "data engineer",
    "analyst",
    "machine learning",
    "research",
    "scientist",
    "security",
    "network",
    "support",
    "sales",
    "marketing",
    "marketer",
    "recruiter",
    "designer",
    "product manager",
    "program manager",
    "project manager",
    "consultant",
    "solutions engineer",
    "customer",
  ],
  include_internships: false,
  locations: [
    "hyderabad",
    "secunderabad",
    "bangalore",
    "bengaluru",
    "mumbai",
    "navi mumbai",
    "thane",
    "chennai",
    "pune",
    // Kerala
    "kerala",
    "kochi",
    "cochin",
    "thiruvananthapuram",
    "trivandrum",
    "kozhikode",
    "calicut",
    "thrissur",
    "pan india",
    "anywhere in india",
  ],
  allow_remote_india: true,
  exp_bands: { fit_max: 1, justify_max: 2, stretch_max: 3 },
  excluded_companies: [],
  keywords: [],
};

/** Parse stored rows over the defaults. Invalid stored values are reported, not silently used. */
export function mergePreferences(rows: { key: string; value: unknown }[]): {
  preferences: Preferences;
  invalidKeys: string[];
} {
  const merged: Record<string, unknown> = { ...DEFAULT_PREFERENCES };
  const invalidKeys: string[] = [];

  for (const row of rows) {
    if (!(row.key in preferencesSchema.shape)) continue;
    const key = row.key as PreferenceKey;
    const parsed = preferencesSchema.shape[key].safeParse(row.value);
    if (parsed.success) merged[key] = parsed.data;
    else invalidKeys.push(key);
  }

  return { preferences: preferencesSchema.parse(merged), invalidKeys };
}
