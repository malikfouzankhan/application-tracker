import "server-only";
import { env } from "./env";
import { createResumeLinkParams } from "./sign";

/** Absolute signed link to a resume PDF, valid 24h (claude.md section 9). */
export function signedResumeUrl(variantId: string, now: Date = new Date()): { url: string; expiresAt: Date } {
  const { exp, sig } = createResumeLinkParams(env.PDF_SIGNING_SECRET, variantId, Math.floor(now.getTime() / 1000));
  const url = new URL(`/r/${variantId}`, env.APP_URL);
  url.searchParams.set("exp", String(exp));
  url.searchParams.set("sig", sig);
  return { url: url.toString(), expiresAt: new Date(exp * 1000) };
}
