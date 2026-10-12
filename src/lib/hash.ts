import { createHash } from "node:crypto";

// Query params that only track the click. Removing them lets the same posting
// arriving from different alerts dedupe to one url_hash. Compared lowercase.
const TRACKING_PARAMS = new Set([
  "gclid",
  "fbclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "gh_src", // Greenhouse
  "lever-source", // Lever
  "lever-origin",
  "trk", // LinkedIn alert links
  "trackingid",
  "refid",
  "lipi",
  "midtoken",
  "midsig",
  "eid",
  "otptoken",
]);

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith("utm_") || TRACKING_PARAMS.has(lower);
}

/**
 * Canonical form of a job URL: lowercase scheme and host, no default port, no fragment,
 * no tracking params, remaining params sorted, no trailing slash.
 * Throws on input that is not an absolute http(s) URL.
 */
export function normalizeUrl(input: string): string {
  const url = new URL(input.trim());
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Unsupported URL protocol: ${url.protocol}`);
  }

  url.hash = "";
  url.username = "";
  url.password = "";

  const kept = [...url.searchParams.entries()]
    .filter(([name]) => !isTrackingParam(name))
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  url.search = new URLSearchParams(kept).toString();

  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  const result = url.toString();
  // "https://x.com/" and "https://x.com" are the same page.
  return url.pathname === "/" && !url.search ? result.replace(/\/$/, "") : result;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** jobs.url_hash: sha256 of the normalized URL. */
export function urlHash(url: string): string {
  return sha256Hex(normalizeUrl(url));
}
