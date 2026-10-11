import { describe, expect, it } from "vitest";
import {
  RESUME_LINK_TTL_SECONDS,
  createResumeLinkParams,
  resumeLinkSignature,
  verifyResumeLinkSignature,
} from "./sign";

const SECRET = "test-secret-that-is-at-least-32-bytes-long";
const VARIANT = "6f1c2c1e-9a0b-4f7e-8a43-5d1b2f6a9c10";
const NOW = 1_800_000_000;

describe("resume link signatures", () => {
  it("verifies a freshly created link", () => {
    const { exp, sig } = createResumeLinkParams(SECRET, VARIANT, NOW);
    expect(exp).toBe(NOW + RESUME_LINK_TTL_SECONDS);
    expect(verifyResumeLinkSignature(SECRET, VARIANT, String(exp), sig, NOW)).toBe(true);
    expect(verifyResumeLinkSignature(SECRET, VARIANT, String(exp), sig, exp - 1)).toBe(true);
  });

  it("rejects an expired link", () => {
    const { exp, sig } = createResumeLinkParams(SECRET, VARIANT, NOW);
    expect(verifyResumeLinkSignature(SECRET, VARIANT, String(exp), sig, exp)).toBe(false);
    expect(verifyResumeLinkSignature(SECRET, VARIANT, String(exp), sig, exp + 60)).toBe(false);
  });

  it("rejects an expiry more than 24h ahead, even if correctly signed", () => {
    const exp = NOW + RESUME_LINK_TTL_SECONDS + 1;
    const sig = resumeLinkSignature(SECRET, VARIANT, exp);
    expect(verifyResumeLinkSignature(SECRET, VARIANT, String(exp), sig, NOW)).toBe(false);
  });

  it("rejects a tampered exp, variant, signature or secret", () => {
    const { exp, sig } = createResumeLinkParams(SECRET, VARIANT, NOW);
    expect(verifyResumeLinkSignature(SECRET, VARIANT, String(exp - 10), sig, NOW)).toBe(false);
    expect(
      verifyResumeLinkSignature(SECRET, "00000000-0000-0000-0000-000000000000", String(exp), sig, NOW),
    ).toBe(false);
    const flipped = (sig[0] === "a" ? "b" : "a") + sig.slice(1);
    expect(verifyResumeLinkSignature(SECRET, VARIANT, String(exp), flipped, NOW)).toBe(false);
    expect(verifyResumeLinkSignature(`${SECRET}x`, VARIANT, String(exp), sig, NOW)).toBe(false);
  });

  it("rejects missing or malformed params without throwing", () => {
    const { exp, sig } = createResumeLinkParams(SECRET, VARIANT, NOW);
    expect(verifyResumeLinkSignature(SECRET, VARIANT, null, sig, NOW)).toBe(false);
    expect(verifyResumeLinkSignature(SECRET, VARIANT, String(exp), undefined, NOW)).toBe(false);
    expect(verifyResumeLinkSignature(SECRET, VARIANT, "12abc", sig, NOW)).toBe(false);
    expect(verifyResumeLinkSignature(SECRET, VARIANT, String(exp), sig.slice(2), NOW)).toBe(false);
    expect(verifyResumeLinkSignature(SECRET, VARIANT, String(exp), sig.toUpperCase(), NOW)).toBe(
      false,
    );
  });
});
