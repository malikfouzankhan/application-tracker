import { createHmac, timingSafeEqual } from "node:crypto";

// Signed resume links: /r/<variantId>?exp=<unix>&sig=<hmac> (claude.md section 9).
// Pure functions: callers pass the secret (env.PDF_SIGNING_SECRET) and the clock.

export const RESUME_LINK_TTL_SECONDS = 24 * 60 * 60;

export function resumeLinkSignature(secret: string, variantId: string, exp: number): string {
  return createHmac("sha256", secret).update(`${variantId}.${exp}`).digest("hex");
}

export function createResumeLinkParams(
  secret: string,
  variantId: string,
  nowSeconds: number,
  ttlSeconds: number = RESUME_LINK_TTL_SECONDS,
): { exp: number; sig: string } {
  const exp = nowSeconds + ttlSeconds;
  return { exp, sig: resumeLinkSignature(secret, variantId, exp) };
}

/** True only for an unexpired signature, at most 24h ahead, compared in constant time. */
export function verifyResumeLinkSignature(
  secret: string,
  variantId: string,
  exp: string | null | undefined,
  sig: string | null | undefined,
  nowSeconds: number,
): boolean {
  if (!exp || !sig || !/^\d{1,12}$/.test(exp) || !/^[0-9a-f]{64}$/.test(sig)) return false;

  const expSeconds = Number(exp);
  if (expSeconds <= nowSeconds || expSeconds - nowSeconds > RESUME_LINK_TTL_SECONDS) return false;

  const expected = Buffer.from(resumeLinkSignature(secret, variantId, expSeconds), "hex");
  const actual = Buffer.from(sig, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
