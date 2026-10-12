import { describe, expect, it } from "vitest";
import { FetchError, assertAllowedUrl, fetchJson } from "./http";
import { mapWithConcurrency } from "./pool";

describe("SSRF guard", () => {
  it("allows only the ATS/HN API hosts over https", () => {
    expect(() => assertAllowedUrl("https://boards-api.greenhouse.io/v1/boards/acme/jobs")).not.toThrow();
    for (const url of [
      "http://boards-api.greenhouse.io/v1/boards/acme/jobs",
      "https://evil.example/jobs",
      "https://boards-api.greenhouse.io.evil.example/x",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/x",
      "https://user@api.lever.co/v0/postings/x",
      "https://api.lever.co:8443/v0/postings/x",
    ]) {
      expect(() => assertAllowedUrl(url), url).toThrow(FetchError);
    }
  });
});

describe("fetchJson", () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

  it("refuses disallowed hosts before any request", async () => {
    let called = false;
    const fake = (async () => {
      called = true;
      return ok({});
    }) as typeof fetch;
    await expect(fetchJson("https://evil.example/x", fake)).rejects.toThrow(FetchError);
    expect(called).toBe(false);
  });

  it("does not follow redirects", async () => {
    let redirect: RequestRedirect | undefined;
    const fake = (async (_url: unknown, init?: RequestInit) => {
      redirect = init?.redirect;
      return ok({ jobs: [] });
    }) as typeof fetch;
    await fetchJson("https://api.ashbyhq.com/posting-api/job-board/acme", fake);
    expect(redirect).toBe("error");
  });

  it("retries 5xx then succeeds, but does not retry 404", async () => {
    let calls = 0;
    const flaky = (async () => (++calls < 2 ? new Response("", { status: 503 }) : ok({ jobs: [1] }))) as typeof fetch;
    await expect(fetchJson("https://api.lever.co/v0/postings/acme?mode=json", flaky)).resolves.toEqual({ jobs: [1] });
    expect(calls).toBe(2);

    calls = 0;
    const missing = (async () => {
      calls++;
      return new Response("", { status: 404 });
    }) as typeof fetch;
    await expect(fetchJson("https://api.lever.co/v0/postings/nope?mode=json", missing)).rejects.toMatchObject({ status: 404 });
    expect(calls).toBe(1);
  });
});

describe("mapWithConcurrency", () => {
  it("keeps order and never exceeds the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(peak).toBe(3);
  });
});
