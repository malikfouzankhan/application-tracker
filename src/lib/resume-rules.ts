// Mechanical checks behind the resume tailoring rules (claude.md section 8). The judgment calls
// (no new scope, outcomes, titles) are covered by required justifications and MFK's approval;
// these catch the cheap-to-detect fabrications: numbers and skills.

/** Splits "React, Next.js, AI APIs (Anthropic Claude, OpenAI)" on top-level commas only. */
export function splitSkillList(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      if (current.trim()) out.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

const skillKey = (skill: string) => skill.trim().toLowerCase().replace(/\s+/g, " ");

export type SkillClaim = { entity: string; text: string };

/** Every skill MFK has verified, keyed case-insensitively, with its category (the claim entity). */
export function verifiedSkills(skillClaims: SkillClaim[]): Map<string, { skill: string; category: string }> {
  const map = new Map<string, { skill: string; category: string }>();
  for (const claim of skillClaims) {
    for (const skill of splitSkillList(claim.text)) {
      if (!map.has(skillKey(skill))) map.set(skillKey(skill), { skill, category: claim.entity });
    }
  }
  return map;
}

export function unknownSkills(skillsOrder: string[], verified: Map<string, unknown>): string[] {
  return skillsOrder.filter((s) => !verified.has(skillKey(s)));
}

/**
 * Numbers mentioned in text, normalized: "1,000+" -> "1000", "~30%" -> "30", "1M" -> "1m",
 * "08/2026" -> "08", "2026". Digits inside words ("R2", "S3") are not numbers here.
 */
export function extractNumbers(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(/\b\d[\d,]*(?:\.\d+)?(?:[kKmMbB]\b)?/g)) {
    found.add(match[0].replace(/,/g, "").toLowerCase());
  }
  return found;
}

/** Numbers in `candidate` that appear in none of the `sources`. */
export function newNumbers(candidate: string, sources: (string | null | undefined)[]): string[] {
  const allowed = new Set<string>();
  for (const s of sources) if (s) for (const n of extractNumbers(s)) allowed.add(n);
  return [...extractNumbers(candidate)].filter((n) => !allowed.has(n));
}
