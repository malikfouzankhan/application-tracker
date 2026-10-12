import type { claims } from "@/db/schema";
import { verifiedSkills } from "@/lib/resume-rules";

// Pure: turns a variant (ordered claims + rephrases + summary + skills order) into the
// sections of the single-column resume. Rendering lives in ResumeDocument.tsx.

type Claim = typeof claims.$inferSelect;

export type ResumeProfile = {
  fullName: string;
  headline: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  links: { label: string; url: string }[];
};

export type ResumeItem = { claim: Claim; text: string };

export type EntryGroup = {
  title: string; // role or project name
  org: string | null; // company (experience) or tech stack (projects)
  dateLabel: string | null;
  blocks: { heading: string | null; bullets: string[] }[];
};

export type EducationEntry = { institution: string; place: string | null; degree: string | null; dateLabel: string | null };

export type ResumeLayout = {
  profile: ResumeProfile;
  summary: string;
  experience: EntryGroup[];
  education: EducationEntry[];
  projects: EntryGroup[];
  skills: { category: string; items: string[] }[];
  certifications: string[];
};

function formatMonth(date: string): string {
  const [y, m] = date.split("-");
  return `${m}/${y}`;
}

/** Explicit label wins; otherwise MM/YYYY - MM/YYYY (or Present when ongoing). */
export function dateLabelFor(claim: Pick<Claim, "dateLabel" | "startDate" | "endDate" | "kind">): string | null {
  if (claim.dateLabel) return claim.dateLabel;
  if (!claim.startDate) return null;
  if (claim.kind === "project" && (!claim.endDate || claim.endDate === claim.startDate)) return formatMonth(claim.startDate);
  return `${formatMonth(claim.startDate)} - ${claim.endDate ? formatMonth(claim.endDate) : "Present"}`;
}

/** Groups consecutive-or-not items by key, keeping first-appearance order. */
function groupBy<T>(items: T[], key: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return [...groups.values()];
}

function entryGroups(items: ResumeItem[], kind: "experience" | "project"): EntryGroup[] {
  const ofKind = items.filter((i) => i.claim.kind === kind);
  const groupKey = (i: ResumeItem) =>
    kind === "experience" ? JSON.stringify([i.claim.entity, i.claim.role]) : i.claim.entity;

  return groupBy(ofKind, groupKey).map((group) => {
    const first = group[0].claim;
    const blocks = groupBy(group, (i) => (kind === "experience" ? (i.claim.context ?? "") : "")).map((b) => ({
      heading: kind === "experience" ? b[0].claim.context : null,
      bullets: b.map((i) => i.text),
    }));
    return kind === "experience"
      ? { title: first.role ?? first.entity, org: first.role ? first.entity : null, dateLabel: dateLabelFor(first), blocks }
      : { title: first.entity, org: first.context, dateLabel: dateLabelFor(first), blocks };
  });
}

export function buildResumeLayout(input: {
  profile: ResumeProfile;
  summary: string;
  items: ResumeItem[];
  skillsOrder: string[];
  skillClaims: { entity: string; text: string }[];
}): ResumeLayout {
  const verified = verifiedSkills(input.skillClaims);
  const categoryOrder = [...new Set(input.skillClaims.map((c) => c.entity))];
  const byCategory = new Map<string, string[]>();
  for (const name of input.skillsOrder) {
    const hit = verified.get(name.trim().toLowerCase().replace(/\s+/g, " "));
    if (!hit) continue; // rejected at variant creation; ignored here as defense in depth
    const list = byCategory.get(hit.category) ?? [];
    if (!list.includes(hit.skill)) list.push(hit.skill);
    byCategory.set(hit.category, list);
  }

  return {
    profile: input.profile,
    summary: input.summary,
    experience: entryGroups(input.items, "experience"),
    education: input.items
      .filter((i) => i.claim.kind === "education")
      .map((i) => ({
        institution: i.claim.entity,
        place: i.claim.context,
        degree: i.claim.role,
        dateLabel: dateLabelFor(i.claim),
      })),
    projects: entryGroups(input.items, "project"),
    skills: categoryOrder.filter((c) => byCategory.has(c)).map((c) => ({ category: c, items: byCategory.get(c) ?? [] })),
    certifications: input.items.filter((i) => i.claim.kind === "achievement").map((i) => i.text),
  };
}

/** "Malik_Fouzan_Khan_Acme_Backend_Engineer.pdf": ASCII only, safe in Content-Disposition. */
export function resumeFilename(fullName: string, company: string, role: string): string {
  const part = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  const name = [fullName, company, role].map(part).filter(Boolean).join("_").slice(0, 120).replace(/_+$/, "");
  return `${name || "Resume"}.pdf`;
}
