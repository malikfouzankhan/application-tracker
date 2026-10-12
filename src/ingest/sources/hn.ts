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
  /\b(remote|on-?site|hybrid|in-?office|wfh|anywhere|worldwide|global|india|bangalore|bengaluru|hyderabad|mumbai|pune|chennai|delhi|gurgaon|gurugram|noida|kochi|apac|asia|emea|europe|eu|uk|us|usa|canada|london|berlin|paris|amsterdam|nyc|new york|sf|san francisco|bay area|seattle|austin|boston|toronto|singapore|tokyo|sydney)\b/i;

/** Splits the header line into company, location and the full line (used as the title). */
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
    if (LOCATION_HINT.test(inner)) locations.push(inner);
  }
  // Other short segments that mention a place, kept whole: "Remote (India)", "Bengaluru, India".
  for (const segment of segments.slice(1)) {
    if (segment.length <= 80 && LOCATION_HINT.test(segment)) locations.push(segment);
  }

  return { companyName: companyName.slice(0, 200), title: line, locationRaw: locations.length ? [...new Set(locations)].join("; ") : null };
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
