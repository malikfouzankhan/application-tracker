import type { remoteTypeValues } from "@/db/enums";
import type { Preferences } from "@/lib/preferences";

// Cheap, deterministic filtering in code before Claude sees anything (claude.md section 6.7).
// Failed jobs are kept with their reason, for stats and the /jobs page.

export type PrefilterInput = {
  title: string;
  companyName: string;
  locationRaw: string | null;
  remoteType: (typeof remoteTypeValues)[number];
  expMin: number | null;
  isDreamCompany: boolean;
};

export type PrefilterResult = { passed: boolean; reason: string | null };

const DREAM_EXTRA_YEARS = 2;

const REMOTE_NOISE = /\b(remote|work from home|wfh|full[\s-]?time|part[\s-]?time|contract|only|ok|friendly)\b/gi;
const INDIA_FRIENDLY = /\b(india|indian|ist|asia|apac|anywhere|worldwide|global)\b/i;
const REMOTE_WORD = /\b(remote|work from home|wfh)\b/i;

/** Lowercase, hyphens/underscores/slashes to spaces, single spaces. */
function normalizeTerm(value: string): string {
  return value
    .toLowerCase()
    .replace(/[-_/|,()[\]]+/g, " ")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function containsTerm(haystack: string, term: string): boolean {
  const t = normalizeTerm(term);
  if (!t) return false;
  return ` ${haystack} `.includes(` ${t} `);
}

// Seniority levels above an early-career engineer: "SDE III", "Engineer IV", "L5", "SWE 3",
// "Level 4". SDE 2 / Engineer II stay (justify or stretch territory).
const SENIOR_LEVEL =
  /\b(?:sde|swe|engineer|developer|software development engineer|level|grade|e|l|ic|mts)\s*(?:iii|iv|v|vi|[3-9])\b|\b(?:iii|iv)\b/;

function checkTitle(title: string, prefs: Preferences): string | null {
  const t = normalizeTerm(title);
  if (!prefs.include_internships && /\bintern(ship)?s?\b/.test(t)) return "title_internship";
  if (SENIOR_LEVEL.test(t)) return "title_level_too_high";
  if (prefs.title_exclusions.some((ex) => containsTerm(t, ex))) return "title_excluded";
  if (!prefs.role_keywords.some((kw) => containsTerm(t, kw))) return "title_no_role_match";
  return null;
}

function checkLocation(
  input: PrefilterInput,
  prefs: Preferences,
): { ok: boolean; reason: string | null } {
  const loc = (input.locationRaw ?? "").trim();
  const isRemote = input.remoteType === "remote" || REMOTE_WORD.test(loc);

  if (!loc && input.remoteType === "unknown") return { ok: true, reason: "location_unknown" };

  const normalized = normalizeTerm(loc);
  if (prefs.locations.some((l) => containsTerm(normalized, l))) return { ok: true, reason: null };
  if (/^india$/i.test(loc)) return { ok: true, reason: null };

  if (isRemote && (prefs.allow_remote_india || prefs.allow_remote_anywhere)) {
    if (INDIA_FRIENDLY.test(loc)) return { ok: true, reason: null };
    // Open to global remote: keep it, and let Claude check whether the employer hires from India.
    if (prefs.allow_remote_anywhere) return { ok: true, reason: "remote_any_region" };
    // Any place named besides "remote" ("San Francisco, Remote", "Remote (US only)") means the
    // role is tied to somewhere else. Only a bare "Remote" is left for Claude to judge.
    const rest = loc.replace(REMOTE_NOISE, "").replace(/[^a-z]+/gi, "");
    if (rest) return { ok: false, reason: "remote_not_india" };
    return { ok: true, reason: "remote_region_unclear" };
  }

  return { ok: false, reason: "location_mismatch" };
}

export function prefilterJob(input: PrefilterInput, prefs: Preferences): PrefilterResult {
  const company = input.companyName.trim().toLowerCase();
  if (prefs.excluded_companies.some((c) => c.trim().toLowerCase() === company)) {
    return { passed: false, reason: "excluded_company" };
  }

  const titleReason = checkTitle(input.title, prefs);
  if (titleReason) return { passed: false, reason: titleReason };

  const location = checkLocation(input, prefs);
  if (!location.ok) return { passed: false, reason: location.reason };

  // Beyond the stretch band the job is not worth MFK's time; dream companies get 2 more years.
  const maxMin = prefs.exp_bands.stretch_max + (input.isDreamCompany ? DREAM_EXTRA_YEARS : 0);
  if (input.expMin !== null && input.expMin > maxMin) {
    return { passed: false, reason: "exp_too_high" };
  }

  // Passing jobs keep a note when something was unknown.
  return { passed: true, reason: location.reason ?? (input.expMin === null ? "exp_unknown" : null) };
}
