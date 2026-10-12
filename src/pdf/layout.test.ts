import { describe, expect, it } from "vitest";
import type { claims } from "@/db/schema";
import { buildResumeLayout, dateLabelFor, resumeFilename } from "./layout";

type Claim = typeof claims.$inferSelect;

let seq = 0;
function claim(over: Partial<Claim>): Claim {
  return {
    id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
    kind: "experience",
    entity: "Acme",
    role: null,
    context: null,
    dateLabel: null,
    text: "did a thing",
    metrics: null,
    tags: [],
    startDate: null,
    endDate: null,
    verified: true,
    active: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

const profile = { fullName: "Malik Fouzan Khan", headline: null, email: null, phone: null, location: null, links: [] };

describe("buildResumeLayout", () => {
  const a1 = claim({ entity: "Zenoids", role: "Software Engineer", context: "CRM", dateLabel: "08/2026 - Present", text: "A1" });
  const a2 = claim({ entity: "Zenoids", role: "Software Engineer", context: "ISMS", dateLabel: "08/2026 - Present", text: "A2" });
  const a3 = claim({ entity: "Zenoids", role: "Software Engineer", context: "CRM", text: "A3" });
  const b1 = claim({ entity: "CFI", role: "Trainer", text: "B1" });
  const p1 = claim({ kind: "project", entity: "Farmhouse", context: "Node.js, MongoDB", dateLabel: "03/2026", text: "P1" });
  const e1 = claim({ kind: "education", entity: "Matrusri", role: "B.E. CSE", context: "Hyderabad, India", dateLabel: "2021 - 2025", text: "edu" });
  const c1 = claim({ kind: "achievement", entity: "MongoDB University", text: "MongoDB Aggregation" });

  const layout = buildResumeLayout({
    profile,
    summary: "Summary",
    items: [a1, b1, a2, a3, p1, e1, c1].map((c) => ({ claim: c, text: c.id === a2.id ? "A2 rephrased" : c.text })),
    skillsOrder: ["postgresql", "React", "Node.js", "Kubernetes"],
    skillClaims: [
      { entity: "Frontend", text: "React, Next.js" },
      { entity: "Backend", text: "Node.js, Express" },
      { entity: "Databases", text: "PostgreSQL, MongoDB" },
    ],
  });

  it("groups experience by company + role, then by sub-project, in order of first appearance", () => {
    expect(layout.experience.map((g) => g.title)).toEqual(["Software Engineer", "Trainer"]);
    expect(layout.experience[0]).toMatchObject({ org: "Zenoids", dateLabel: "08/2026 - Present" });
    expect(layout.experience[0].blocks).toEqual([
      { heading: "CRM", bullets: ["A1", "A3"] },
      { heading: "ISMS", bullets: ["A2 rephrased"] },
    ]);
  });

  it("builds projects, education and certifications", () => {
    expect(layout.projects).toEqual([
      { title: "Farmhouse", org: "Node.js, MongoDB", dateLabel: "03/2026", blocks: [{ heading: null, bullets: ["P1"] }] },
    ]);
    expect(layout.education).toEqual([
      { institution: "Matrusri", place: "Hyderabad, India", degree: "B.E. CSE", dateLabel: "2021 - 2025" },
    ]);
    expect(layout.certifications).toEqual(["MongoDB Aggregation"]);
  });

  it("orders skill categories as in the library, skills as chosen, and drops unverified skills", () => {
    expect(layout.skills).toEqual([
      { category: "Frontend", items: ["React"] },
      { category: "Backend", items: ["Node.js"] },
      { category: "Databases", items: ["PostgreSQL"] },
    ]);
  });
});

describe("dateLabelFor", () => {
  it("uses the explicit label, else formats dates", () => {
    expect(dateLabelFor({ kind: "experience", dateLabel: "2021 - 2025", startDate: "2021-01-01", endDate: null })).toBe("2021 - 2025");
    expect(dateLabelFor({ kind: "experience", dateLabel: null, startDate: "2026-08-01", endDate: null })).toBe("08/2026 - Present");
    expect(dateLabelFor({ kind: "experience", dateLabel: null, startDate: "2025-06-01", endDate: "2025-09-30" })).toBe("06/2025 - 09/2025");
    expect(dateLabelFor({ kind: "project", dateLabel: null, startDate: "2026-03-01", endDate: null })).toBe("03/2026");
    expect(dateLabelFor({ kind: "skill", dateLabel: null, startDate: null, endDate: null })).toBeNull();
  });
});

describe("resumeFilename", () => {
  it("is ASCII and header-safe", () => {
    expect(resumeFilename("Malik Fouzan Khan", "Hevo Data", "SDE I")).toBe("Malik_Fouzan_Khan_Hevo_Data_SDE_I.pdf");
    expect(resumeFilename("Malik Fouzan Khan", 'Acmé "Labs"; x', "Dev/Ops\r\nInjected: 1")).toBe(
      "Malik_Fouzan_Khan_Acme_Labs_x_Dev_Ops_Injected_1.pdf",
    );
  });
});
