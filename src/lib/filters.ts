import { z } from "zod";
import {
  appChannelValues,
  appStatusValues,
  archetypeValues,
  jobSourceValues,
  outreachStatusValues,
  tierValues,
} from "@/db/enums";

// URL search params -> typed filters. Shared by pages, the kanban and the CSV export, so a
// bookmarked URL always means the same view (claude.md section 11). Invalid values are dropped.

export type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const many = (v: unknown) => (Array.isArray(v) ? v : v === undefined ? [] : [v]);
const opt = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (one(v) === "" ? undefined : one(v)), schema.optional().catch(undefined));
const optDate = opt(z.iso.date());
const flag = z.preprocess((v) => one(v) === "1", z.boolean());

export const APPLICATION_SORTS = ["activity", "applied", "created", "fit", "company"] as const;

const applicationFiltersSchema = z.object({
  status: z.preprocess(many, z.array(z.string())).transform((s) =>
    s.filter((x): x is (typeof appStatusValues)[number] => (appStatusValues as readonly string[]).includes(x)),
  ),
  tier: opt(z.enum(tierValues)),
  archetype: opt(z.enum(archetypeValues)),
  source: opt(z.enum(jobSourceValues)),
  channel: opt(z.enum(appChannelValues)),
  company: opt(z.string().trim().max(100)),
  q: opt(z.string().trim().max(100)),
  createdFrom: optDate,
  createdTo: optDate,
  appliedFrom: optDate,
  appliedTo: optDate,
  hasOutreach: opt(z.enum(["yes", "no"])),
  outreachStatus: opt(z.enum(outreachStatusValues)),
  scam: flag,
  dream: flag,
  archived: flag,
  sort: opt(z.enum(APPLICATION_SORTS)).transform((v) => v ?? "activity"),
  page: z.preprocess(one, z.coerce.number().int().min(1).max(1000).catch(1)).default(1),
  view: opt(z.enum(["table", "kanban"])).transform((v) => v ?? "table"),
});

export type ApplicationFilters = z.infer<typeof applicationFiltersSchema>;

export function parseApplicationFilters(params: SearchParams): ApplicationFilters {
  return applicationFiltersSchema.parse(params);
}

const jobFiltersSchema = z.object({
  stage: opt(z.enum(["new", "assessed", "shortlisted"])),
  tier: opt(z.enum(["fit", "justify", "stretch", "unassessed"])),
  source: opt(z.enum(jobSourceValues)),
  q: opt(z.string().trim().max(100)),
  since: optDate,
  page: z.preprocess(one, z.coerce.number().int().min(1).max(1000).catch(1)).default(1),
});

export type JobFilters = z.infer<typeof jobFiltersSchema>;

export function parseJobFilters(params: SearchParams): JobFilters {
  return jobFiltersSchema.parse(params);
}

/** Back to a query string, skipping defaults, with overrides (e.g. a different page or sort). */
export function toQuery(filters: Record<string, unknown>, overrides: Record<string, unknown> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, ...overrides })) {
    if (value === undefined || value === null || value === false || value === "") continue;
    if (key === "page" && value === 1) continue;
    if (key === "sort" && value === "activity") continue;
    if (key === "view" && value === "table") continue;
    if (Array.isArray(value)) for (const v of value) params.append(key, String(v));
    else params.set(key, value === true ? "1" : String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** Escapes LIKE wildcards in user input. */
export function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
