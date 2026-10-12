import { describe, expect, it } from "vitest";
import { sanitizeExternalText } from "../sanitize";
import { ashby } from "./ashby";
import { greenhouse } from "./greenhouse";
import { latestHiringThreadId, parseHnHeader, parseHnThread } from "./hn";
import { lever } from "./lever";

const company = { id: "11111111-1111-4111-8111-111111111111", name: "Acme", boardToken: "acme" };

describe("board URLs", () => {
  it("are built only from valid tokens", () => {
    expect(greenhouse.boardUrl("acme")).toBe("https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true");
    expect(lever.boardUrl("acme-co")).toBe("https://api.lever.co/v0/postings/acme-co?mode=json");
    expect(ashby.boardUrl("acme")).toBe("https://api.ashbyhq.com/posting-api/job-board/acme");
    for (const bad of ["../x", "acme/jobs", "evil.com", "ACME", "a b", ""]) {
      expect(() => greenhouse.boardUrl(bad)).toThrow();
    }
  });
});

describe("greenhouse.parse", () => {
  it("decodes the entity-escaped content into real HTML", () => {
    const [job] = greenhouse.parse(
      {
        jobs: [
          {
            id: 42,
            title: "Backend Engineer",
            absolute_url: "https://boards.greenhouse.io/acme/jobs/42",
            content: "&lt;p&gt;Build APIs &amp;amp; services&lt;/p&gt;&lt;span style=&quot;display:none&quot;&gt;hidden&lt;/span&gt;",
            location: { name: "Hybrid - Hyderabad" },
            first_published: "2026-10-01T10:00:00Z",
            updated_at: "2026-10-05T10:00:00Z",
            extra_field: true,
          },
        ],
        meta: { total: 1 },
      },
      company,
    );
    expect(job).toMatchObject({
      url: "https://boards.greenhouse.io/acme/jobs/42",
      companyId: company.id,
      companyName: "Acme",
      locationRaw: "Hybrid - Hyderabad",
      source: "greenhouse",
      sourceRef: "42",
    });
    expect(job.postedAt?.toISOString()).toBe("2026-10-01T10:00:00.000Z");
    expect(job.description).toContain("<p>Build APIs &amp; services</p>");
    expect(sanitizeExternalText(job.description).text).toBe("Build APIs & services");
  });

  it("rejects an unexpected shape", () => {
    expect(() => greenhouse.parse({ data: [] }, company)).toThrow();
  });
});

describe("lever.parse", () => {
  it("maps workplace type, locations, country and list sections", () => {
    const [job] = lever.parse(
      [
        {
          id: "abc",
          text: "SDE 1",
          hostedUrl: "https://jobs.lever.co/acme/abc",
          categories: { location: "Bengaluru", allLocations: ["Bengaluru", "Hyderabad"] },
          workplaceType: "hybrid",
          country: "IN",
          createdAt: 1790573982021,
          description: "<p>Intro</p>",
          lists: [{ text: "Requirements", content: "<li>1-2 years of experience</li>" }],
          additional: "<p>Benefits</p>",
        },
      ],
      company,
    );
    expect(job).toMatchObject({
      title: "SDE 1",
      locationRaw: "Bengaluru, Hyderabad",
      remoteType: "hybrid",
      country: "IN",
      source: "lever",
      sourceRef: "abc",
    });
    expect(sanitizeExternalText(job.description).text).toBe("Intro\n\nRequirements\n\n- 1-2 years of experience\n\nBenefits");
  });

  it("leaves unspecified workplace types to inference", () => {
    const [job] = lever.parse([{ id: "x", text: "Dev", hostedUrl: "https://jobs.lever.co/acme/x", workplaceType: "unspecified" }], company);
    expect(job.remoteType).toBeUndefined();
    expect(job.locationRaw).toBeNull();
  });
});

describe("ashby.parse", () => {
  it("skips unlisted jobs and joins secondary locations", () => {
    const jobs = ashby.parse(
      {
        apiVersion: "1",
        jobs: [
          {
            id: "j1",
            title: "Product Engineer",
            jobUrl: "https://jobs.ashbyhq.com/acme/j1",
            location: "Remote, India",
            secondaryLocations: [{ location: "Bengaluru" }],
            isRemote: true,
            isListed: true,
            publishedAt: "2026-10-02T00:00:00Z",
            descriptionHtml: "<p>Hi</p>",
            address: { postalAddress: { addressCountry: "India" } },
          },
          { id: "j2", title: "Hidden", jobUrl: "https://jobs.ashbyhq.com/acme/j2", isListed: false },
        ],
      },
      company,
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ locationRaw: "Remote, India, Bengaluru", remoteType: "remote", country: "India" });
  });
});

describe("HN who is hiring", () => {
  it("finds the newest hiring thread, not 'who wants to be hired'", () => {
    expect(
      latestHiringThreadId({
        hits: [
          { objectID: "2", title: "Ask HN: Who wants to be hired? (October 2026)" },
          { objectID: "1", title: "Ask HN: Who is hiring? (October 2026)" },
        ],
      }),
    ).toBe("1");
  });

  it("parses header lines", () => {
    expect(parseHnHeader("Acme Corp | Backend Engineer | Remote (India) | Full-time")).toEqual({
      companyName: "Acme Corp",
      title: "Backend Engineer",
      locationRaw: "Remote (India)",
    });
    expect(parseHnHeader("Plutus | In Person - Kirkland, WA | Fintech | Full Stack Engineer").locationRaw).toBe("In Person; Kirkland, WA");
    expect(parseHnHeader("Relativity Space | In Office (Long Beach, CA ) | Software Engineer")).toMatchObject({
      title: "Software Engineer",
      locationRaw: "In Office (Long Beach, CA )",
    });
    expect(parseHnHeader("PrairieLearn (Remote US) \u{2014} Full-Stack Software Engineer").companyName).toBe("PrairieLearn");
    expect(parseHnHeader("PrairieLearn (Remote US) \u{2014} Full-Stack Software Engineer").locationRaw).toBe("Remote US");
  });

  it("turns top-level comments into jobs and skips deleted ones", () => {
    const jobs = parseHnThread({
      id: 1,
      children: [
        { id: 10, author: "a", text: "Acme | SDE | Bengaluru<p>Details with <a href=\"https://jobs.lever.co/acme\">link</a>", created_at: "2026-10-01T15:00:00Z" },
        { id: 11, author: null, text: null },
      ],
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      url: "https://news.ycombinator.com/item?id=10",
      companyName: "Acme",
      locationRaw: "Bengaluru",
      source: "hn",
      sourceRef: "10",
    });
  });
});
