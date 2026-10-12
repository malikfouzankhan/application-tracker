import { describe, expect, it } from "vitest";
import { extractNumbers, newNumbers, splitSkillList, unknownSkills, verifiedSkills } from "./resume-rules";

describe("splitSkillList", () => {
  it("splits on top-level commas only", () => {
    expect(splitSkillList("WhatsApp Business Cloud API, Resend, AI APIs (Anthropic Claude, OpenAI)")).toEqual([
      "WhatsApp Business Cloud API",
      "Resend",
      "AI APIs (Anthropic Claude, OpenAI)",
    ]);
  });
});

describe("verified skills", () => {
  const verified = verifiedSkills([
    { entity: "Frontend", text: "React, Next.js, TypeScript" },
    { entity: "Languages & Tools", text: "TypeScript, Python" },
  ]);

  it("maps skills to their category, case-insensitively", () => {
    expect(verified.get("next.js")).toEqual({ skill: "Next.js", category: "Frontend" });
    expect(verified.get("typescript")?.category).toBe("Frontend");
  });

  it("flags skills MFK has not verified", () => {
    expect(unknownSkills(["react", "Next.js", "Kubernetes", "Go"], verified)).toEqual(["Kubernetes", "Go"]);
  });
});

describe("numbers", () => {
  it("normalizes formatting", () => {
    expect([...extractNumbers("1,000+ reports, ~30% faster, 1M rows, 08/2026, Cloudflare R2")].sort()).toEqual(
      ["08", "1000", "1m", "2026", "30"].sort(),
    );
  });

  it("allows numbers present in the source claim", () => {
    expect(newNumbers("Delivered 1000+ medical reports monthly", ["delivering 1,000+ reports per month"])).toEqual([]);
    expect(newNumbers("Cut delivery time by 30%", ["cutting delivery time per report by ~30%"])).toEqual([]);
  });

  it("catches invented numbers", () => {
    expect(newNumbers("Delivered 5,000+ reports to 40 clinics", ["delivering 1,000+ reports per month"])).toEqual([
      "5000",
      "40",
    ]);
    expect(newNumbers("Handled 10M rows", ["handling up to 1M rows"])).toEqual(["10m"]);
  });
});
