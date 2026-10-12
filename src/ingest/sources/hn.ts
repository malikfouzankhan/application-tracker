import { z } from "zod";
import type { NormalizedJob } from "../normalize";
import { sanitizeLine } from "../sanitize";
import { toDate } from "./types";

// HN "Ask HN: Who is hiring?" via the Algolia HN API. One top-level comment = one posting.
// Comments start with a header line like "Acme | Backend Engineer | Remote (India) | Full-time".

export const HN_SEARCH_URL =
  "https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=10";

export const hnItemUrl = (id: string) => {
  if (!/^\d{1,12}$/.test(id)) throw new Error(`Invalid HN item id: ${id}`);
  return `https://hn.algolia.com/api/v1/items/${id}`;
};

const searchSchema = z.looseObject({
  hits: z.array(z.looseObject({ objectID: z.string(), title: z.string().nullish() })),
});

const itemSchema = z.looseObject({
  id: z.number(),
  children: z.array(
    z.looseObject({
      id: z.number(),
      text: z.string().nullish(),
      author: z.string().nullish(),
      created_at: z.string().nullish(),
    }),
  ),
});

/** The newest "Who is hiring?" thread id from a search response. */
export function latestHiringThreadId(json: unknown): string | null {
  const hit = searchSchema.parse(json).hits.find((h) => /^Ask HN: Who is hiring\?/i.test(h.title ?? ""));
  return hit?.objectID ?? null;
}

const LOCATION_HINT =
  /\b(remote|on-?site|hybrid|in-?office|in[- ]person|wfh|anywhere|worldwide|global|india|bangalore|bengaluru|hyderabad|mumbai|pune|chennai|delhi|gurgaon|gurugram|noida|kochi|apac|asia|emea|europe|eu|uk|us|usa|canada|london|berlin|paris|amsterdam|nyc|new york|sf|san francisco|bay area|seattle|austin|boston|toronto|singapore|tokyo|sydney)\b/i;

// "Kirkland, WA", "Long Beach, CA": a US state code after a comma.
const US_STATE = /,\s*(?:A[KLRZ]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])\b/;
const ROLE_HINT = /\b(engineers?|developers?|sde|swe|programmers?|architects?|full[- ]?stack|back[- ]?end|front[- ]?end)\b/i;

const isLocation = (s: string) => LOCATION_HINT.test(s) || US_STATE.test(s);

/** Splits the header line into company, role title and location. */
export function parseHnHeader(header: string): { companyName: string; title: string; locationRaw: string | null } {
  // Some posters put the whole first paragraph on the header line; keep titles short.
  const line = sanitizeLine(header, 200);
  const segments = line
    .split(/\s*\|\s*|\s+[\u{2013}\u{2014}]\s+|\s+-\s+/u)
    .map((s) => s.trim())
    .filter(Boolean);

  const first = segments[0] ?? line;
  const companyName = first.replace(/\s*\([^)]*\)\s*/g, " ").trim() || first;

  const locations: string[] = [];
  // "PrairieLearn (Remote US)": the location hides in the company segment's parentheses.
  for (const paren of first.match(/\(([^)]*)\)/g) ?? []) {
    const inner = paren.slice(1, -1).trim();
    if (isLocation(inner)) locations.push(inner);
  }
  // Other segments that mention a place, kept whole: "Remote (India)", "In Person", "Kirkland, WA".
  const rest = segments.slice(1);
  for (const segment of rest) {
    if (segment.length <= 200 && isLocation(segment) && !ROLE_HINT.test(segment)) locations.push(segment);
  }

  // The role is the first segment naming one ("Backend Software Engineer"); else the whole line.
  const role = rest.find((s) => s.length <= 120 && ROLE_HINT.test(s));
  return {
    companyName: companyName.slice(0, 200),
    title: role ?? line,
    locationRaw: locations.length ? [...new Set(locations)].join("; ") : null,
  };
}

export function parseHnThread(json: unknown): NormalizedJob[] {
  const thread = itemSchema.parse(json);
  return thread.children.flatMap((comment) => {
    const html = comment.text?.trim();
    if (!html || !comment.author) return []; // deleted or dead
    const header = html.split(/<p>/i)[0] ?? "";
    const { companyName, title, locationRaw } = parseHnHeader(header);
    if (!companyName || !title) return [];
    return [
      {
        url: `https://news.ycombinator.com/item?id=${comment.id}`,
        companyName,
        title,
        locationRaw,
        description: html,
        source: "hn" as const,
        sourceRef: String(comment.id),
        postedAt: toDate(comment.created_at),
      },
    ];
  });
}
