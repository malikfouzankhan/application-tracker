// Parses experience requirements like "0-2 years", "1 to 3 yrs", "2+ years",
// "minimum 3 years", including en/em dash variants (claude.md section 6.7).

export type ExperienceRange = { min: number; max: number | null };

const MAX_YEARS = 30;
const YEARS = String.raw`(?:years?|yrs?)\b`;
const DASH = String.raw`\s*(?:-|‐|‑|‒|–|—|―|to)\s*`;
const NUM = String.raw`(\d{1,2}(?:\.\d)?)`;

type Pattern = { re: RegExp; build: (m: RegExpExecArray) => ExperienceRange };

const PATTERNS: Pattern[] = [
  // "1-3 years", "1 to 3 yrs", "2–4+ years"
  {
    re: new RegExp(`\\b${NUM}${DASH}${NUM}\\s*\\+?\\s*${YEARS}`, "gi"),
    build: (m) => ({ min: Number(m[1]), max: Number(m[2]) }),
  },
  // "minimum 3 years", "min. 2 yrs", "at least 2 years", "minimum of 3 years"
  {
    re: new RegExp(
      `\\b(?:minimum|min\\.?|at\\s*least|atleast)\\s*(?:of\\s*)?${NUM}\\s*\\+?\\s*${YEARS}`,
      "gi",
    ),
    build: (m) => ({ min: Number(m[1]), max: null }),
  },
  // "up to 2 years", "upto 3 yrs"
  {
    re: new RegExp(`\\b(?:up\\s*to|upto|max(?:imum)?\\.?)\\s*(?:of\\s*)?${NUM}\\s*${YEARS}`, "gi"),
    build: (m) => ({ min: 0, max: Number(m[1]) }),
  },
  // "2+ years", "3 + yrs"
  {
    re: new RegExp(`\\b${NUM}\\s*\\+\\s*${YEARS}`, "gi"),
    build: (m) => ({ min: Number(m[1]), max: null }),
  },
  // "3 years of experience", "2 yrs exp", "4 years of professional experience"
  {
    re: new RegExp(
      `\\b${NUM}\\s*${YEARS}\\s*(?:of\\s+)?(?:[a-z/+.-]+\\s+){0,3}?(?:experience|exp)\\b`,
      "gi",
    ),
    build: (m) => ({ min: Number(m[1]), max: null }),
  },
];

// Words near a match that make it an experience requirement. Titles skip this check.
const CONTEXT = /\b(experience|exp|work(?:ing)?|professional|industry|hands[\s-]?on|relevant|building|developing|background|proven)\b/i;
// "founded 20 years ago", "10 years old", "since 5 years"
const NOT_EXPERIENCE_AFTER = /^\s*(?:ago|old|history|anniversary|in business|of operations)\b/i;

function valid(range: ExperienceRange): ExperienceRange | null {
  let { min, max } = range;
  if (max !== null && max < min) [min, max] = [max, min];
  if (min < 0 || min > MAX_YEARS || (max !== null && max > MAX_YEARS)) return null;
  return { min: Math.floor(min), max: max === null ? null : Math.ceil(max) };
}

function collect(text: string, requireContext: boolean): ExperienceRange[] {
  const found: ExperienceRange[] = [];
  const claimed: [number, number][] = [];

  for (const { re, build } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const start = m.index;
      const end = start + m[0].length;
      // Earlier (more specific) patterns win over overlapping later ones.
      if (claimed.some(([s, e]) => start < e && end > s)) continue;

      if (NOT_EXPERIENCE_AFTER.test(text.slice(end, end + 20))) continue;
      if (requireContext) {
        const window = text.slice(Math.max(0, start - 50), Math.min(text.length, end + 60));
        if (!CONTEXT.test(window)) continue;
      }

      const range = valid(build(m));
      if (range) {
        found.push(range);
        claimed.push([start, end]);
      }
    }
  }
  return found;
}

function lowestRequirement(ranges: ExperienceRange[]): ExperienceRange | null {
  if (ranges.length === 0) return null;
  // Lenient on purpose: the smallest stated minimum decides, so a job is only dropped
  // when every requirement it states is too high.
  return ranges.reduce((best, r) =>
    r.min < best.min || (r.min === best.min && (r.max ?? Infinity) < (best.max ?? Infinity))
      ? r
      : best,
  );
}

/** Title first (no context needed, e.g. "SDE (1-3 yrs)"), then the description. */
export function parseExperience(title: string, description: string): ExperienceRange | null {
  return lowestRequirement(collect(title, false)) ?? lowestRequirement(collect(description, true));
}

/** Parses a single string, requiring experience context. Mainly for tests and ad-hoc text. */
export function parseExperienceText(text: string): ExperienceRange | null {
  return lowestRequirement(collect(text, true));
}
