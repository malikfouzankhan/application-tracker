import { describe, expect, it } from "vitest";
import { normalizeUrl, urlHash } from "./hash";

describe("normalizeUrl", () => {
  it("strips utm_* params, fragments and trailing slashes", () => {
    expect(
      normalizeUrl("https://jobs.lever.co/acme/123/?utm_source=linkedin&utm_medium=x#apply"),
    ).toBe("https://jobs.lever.co/acme/123");
  });

  it("lowercases scheme and host but keeps path case", () => {
    expect(normalizeUrl("HTTPS://Jobs.Lever.CO/Acme/AbC")).toBe("https://jobs.lever.co/Acme/AbC");
  });

  it("keeps meaningful params, sorted, and drops known trackers", () => {
    expect(
      normalizeUrl("https://boards.greenhouse.io/acme/jobs/1?gh_src=abc&b=2&a=1&gclid=zzz"),
    ).toBe("https://boards.greenhouse.io/acme/jobs/1?a=1&b=2");
    expect(
      normalizeUrl(
        "https://www.linkedin.com/jobs/view/4012345678/?trackingId=AbC%3D%3D&refId=x&trk=eml",
      ),
    ).toBe("https://www.linkedin.com/jobs/view/4012345678");
  });

  it("drops default ports and credentials", () => {
    expect(normalizeUrl("https://user:pw@example.com:443/a/")).toBe("https://example.com/a");
  });

  it("treats the bare origin with or without slash as the same", () => {
    expect(normalizeUrl("https://example.com/")).toBe(normalizeUrl("https://example.com"));
  });

  it("rejects non-http(s) and relative URLs", () => {
    expect(() => normalizeUrl("javascript:alert(1)")).toThrow();
    expect(() => normalizeUrl("ftp://example.com/x")).toThrow();
    expect(() => normalizeUrl("/jobs/1")).toThrow();
  });
});

describe("urlHash", () => {
  it("is a stable sha256 hex digest", () => {
    const h = urlHash("https://example.com/a");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(urlHash("https://example.com/a")).toBe(h);
  });

  it("dedupes the same posting reached through different tracking links", () => {
    expect(urlHash("https://jobs.lever.co/acme/123?utm_source=a")).toBe(
      urlHash("https://JOBS.lever.co/acme/123/#top"),
    );
  });

  it("differs for different postings", () => {
    expect(urlHash("https://jobs.lever.co/acme/123")).not.toBe(
      urlHash("https://jobs.lever.co/acme/124"),
    );
  });
});
