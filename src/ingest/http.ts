// Outbound HTTP for ingestion. SSRF guard (claude.md section 6.3): we never fetch a stored
// URL. Callers build URLs from (ats, board_token) and this module refuses any host outside
// the allowlist, refuses redirects, and caps time and size.

const ALLOWED_HOSTS = new Set([
  "boards-api.greenhouse.io",
  "api.lever.co",
  "api.ashbyhq.com",
  "hn.algolia.com",
]);

const TIMEOUT_MS = 10_000;
const RETRIES = 2;
const MAX_BYTES = 25 * 1024 * 1024;
const USER_AGENT = "jobs.fouzan.dev ingestion (personal job tracker)";

export class FetchError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "FetchError";
    this.status = status;
  }
}

export function assertAllowedUrl(url: string): URL {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname) || parsed.port || parsed.username) {
    throw new FetchError(`Blocked URL host: ${parsed.hostname}`);
  }
  return parsed;
}

async function readCapped(res: Response): Promise<string> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) throw new FetchError(`Response too large: ${declared} bytes`);
  if (!res.body) return "";

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new FetchError(`Response too large: over ${MAX_BYTES} bytes`);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** GET JSON from an allowlisted host. Retries network errors, 429 and 5xx with backoff. */
export async function fetchJson(url: string, fetchImpl: typeof fetch = fetch): Promise<unknown> {
  const target = assertAllowedUrl(url);
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await sleep(500 * 3 ** (attempt - 1)); // 500ms, 1.5s
    try {
      const res = await fetchImpl(target, {
        headers: { accept: "application/json", "user-agent": USER_AGENT },
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = new FetchError(`HTTP ${res.status}`, res.status);
        continue;
      }
      if (!res.ok) throw new FetchError(`HTTP ${res.status}`, res.status); // 4xx: do not retry
      return JSON.parse(await readCapped(res));
    } catch (error) {
      if (error instanceof FetchError && error.status !== null && error.status < 500 && error.status !== 429) throw error;
      if (error instanceof SyntaxError) throw new FetchError("Invalid JSON response");
      lastError = error;
    }
  }
  throw lastError instanceof FetchError
    ? lastError
    : new FetchError(lastError instanceof Error ? lastError.message : "Request failed");
}
