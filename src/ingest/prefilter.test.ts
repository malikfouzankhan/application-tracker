import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES } from "@/lib/preferences";
import { type PrefilterInput, prefilterJob } from "./prefilter";
import { extractBoardRefs } from "./snowball";
import { detectScamFlags } from "./scam";

const base: PrefilterInput = {
  title: "Full Stack Developer",
  companyName: "Acme",
  locationRaw: "Hyderabad, India",
  remoteType: "onsite",
  expMin: 1,
  isDreamCompany: false,
};
const run = (overrides: Partial<PrefilterInput>) =>
  prefilterJob({ ...base, ...overrides }, DEFAULT_PREFERENCES);

describe("prefilterJob", () => {
  it("passes a matching job", () => {
    expect(run({})).toEqual({ passed: true, reason: null });
  });

  it.each([
    ["Senior Backend Engineer", "title_excluded"],
    ["Sr. Software Engineer", "title_excluded"],
    ["Tech Lead - Platform", "title_excluded"],
    ["Engineering Manager", "title_excluded"],
    ["Software Engineering Intern", "title_internship"],
    ["Sales Executive", "title_no_role_match"],
    ["Civil Engineer", "title_no_role_match"],
  ])("rejects title %s", (title, reason) => {
    expect(run({ title })).toEqual({ passed: false, reason });
  });

  it.each(["Backend Engineer", "SDE-1", "Front-End Developer", "AI/ML Engineer", "Software Engineer I"])(
    "accepts title %s",
    (title) => {
      expect(run({ title }).passed).toBe(true);
    },
  );

  it("handles locations", () => {
    expect(run({ locationRaw: "Delhi, India" })).toEqual({ passed: false, reason: "location_mismatch" });
    for (const city of ["Bengaluru, Karnataka", "Bangalore", "Mumbai", "Navi Mumbai", "Chennai, TN", "Pune, Maharashtra", "Kochi, Kerala", "Trivandrum"]) {
      expect(run({ locationRaw: city }).passed).toBe(true);
    }
    expect(run({ locationRaw: "India" }).passed).toBe(true);
    expect(run({ locationRaw: "Remote - India", remoteType: "remote" }).passed).toBe(true);
    expect(run({ locationRaw: "Remote (US only)", remoteType: "remote" })).toEqual({
      passed: false,
      reason: "remote_not_india",
    });
    // Regressions from the first real run: remote roles tied to a foreign place.
    for (const loc of ["San Francisco, New York, Remote", "Remote but Boston based only", "REMOTE (US or Canada) or Toronto", "Remote, Vienna"]) {
      expect(run({ locationRaw: loc, remoteType: "remote" }), loc).toEqual({ passed: false, reason: "remote_not_india" });
    }
    for (const loc of ["Remote, Global", "Full Time, Remote India", "Remote (APAC)", "Anywhere"]) {
      expect(run({ locationRaw: loc, remoteType: "remote" }).passed, loc).toBe(true);
    }
    expect(run({ locationRaw: "Remote, Remote", remoteType: "remote" })).toEqual({ passed: true, reason: "remote_region_unclear" });
    expect(run({ locationRaw: "Foster City, CA", remoteType: "onsite" }).passed).toBe(false);
    expect(run({ locationRaw: null, remoteType: "unknown" })).toEqual({
      passed: true,
      reason: "location_unknown",
    });
  });

  it("drops exp_min >= 3 unless dream company, and passes unknown experience", () => {
    expect(run({ expMin: 3 })).toEqual({ passed: false, reason: "exp_too_high" });
    expect(run({ expMin: 3, isDreamCompany: true }).passed).toBe(true);
    expect(run({ expMin: null })).toEqual({ passed: true, reason: "exp_unknown" });
  });

  it("drops excluded companies", () => {
    const prefs = { ...DEFAULT_PREFERENCES, excluded_companies: ["Acme"] };
    expect(prefilterJob({ ...base, companyName: "acme" }, prefs)).toEqual({
      passed: false,
      reason: "excluded_company",
    });
  });
});

describe("extractBoardRefs", () => {
  it("finds Greenhouse, Lever and Ashby boards, deduped and lowercased", () => {
    const text = `Apply at https://boards.greenhouse.io/Acme/jobs/123 or
      https://job-boards.greenhouse.io/acme/jobs/9, see https://jobs.lever.co/beta-co/abc
      and https://jobs.ashbyhq.com/gamma?x=1`;
    expect(extractBoardRefs(text)).toEqual([
      { ats: "greenhouse", boardToken: "acme" },
      { ats: "lever", boardToken: "beta-co" },
      { ats: "ashby", boardToken: "gamma" },
    ]);
  });

  it("ignores reserved path segments and other hosts", () => {
    expect(extractBoardRefs("https://boards.greenhouse.io/embed/job_app?x=1")).toEqual([]);
    expect(extractBoardRefs("https://evil.example/jobs.lever.co.attacker")).toEqual([]);
  });
});

describe("detectScamFlags", () => {
  it("flags fee requests, free-mail recruiters and messaging apps", () => {
    const flags = detectScamFlags({
      companyName: "Confidential",
      title: "Data Entry",
      description:
        "Pay a registration fee of Rs 2000. Send CV to hr.jobs@gmail.com or WhatsApp us at +91 98765 43210.",
    });
    expect(flags).toEqual(
      expect.arrayContaining(["fee_request", "freemail_recruiter", "missing_company", "messaging_app_contact"]),
    );
  });

  it("does not flag a normal posting", () => {
    expect(
      detectScamFlags({
        companyName: "Acme",
        title: "Backend Engineer",
        description: "Build APIs in Node.js. Competitive salary and health insurance.",
      }),
    ).toEqual([]);
  });
});

describe("snowball from escaped HTML", () => {
  it("finds board links once entities are decoded", async () => {
    const { decodeHtmlEntities } = await import("./sanitize");
    const escaped = 'Apply: <a href="https:&#x2F;&#x2F;jobs.lever.co&#x2F;acme-labs&#x2F;123">here</a>';
    expect(extractBoardRefs(escaped)).toEqual([]);
    expect(extractBoardRefs(decodeHtmlEntities(escaped))).toEqual([{ ats: "lever", boardToken: "acme-labs" }]);
  });
});

describe("inferRemoteType", () => {
  it("trusts the location over the description", async () => {
    const { inferRemoteType } = await import("./normalize");
    expect(inferRemoteType("Foster City, CA", "We are a remote-first team")).toBe("onsite");
    expect(inferRemoteType("Hybrid - Hyderabad")).toBe("hybrid");
    expect(inferRemoteType("Remote, India")).toBe("remote");
    expect(inferRemoteType(null, "This is a fully remote role")).toBe("remote");
    expect(inferRemoteType(null, "")).toBe("unknown");
  });
});
