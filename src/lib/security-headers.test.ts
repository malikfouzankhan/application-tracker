import { describe, expect, it } from "vitest";
import { clerkFrontendApiHost, contentSecurityPolicy, securityHeaders } from "./security-headers";

const key = (host: string, kind = "live") => `pk_${kind}_${Buffer.from(`${host}$`).toString("base64")}`;

describe("clerkFrontendApiHost", () => {
  it("decodes the Frontend API host from a publishable key", () => {
    expect(clerkFrontendApiHost(key("clerk.fouzan.dev"))).toBe("clerk.fouzan.dev");
    expect(clerkFrontendApiHost(key("working-mallard-2628.clerk.accounts.dev", "test"))).toBe(
      "working-mallard-2628.clerk.accounts.dev",
    );
  });

  it("rejects missing or malformed keys", () => {
    expect(clerkFrontendApiHost(undefined)).toBeNull();
    expect(clerkFrontendApiHost("sk_live_abc")).toBeNull();
    expect(clerkFrontendApiHost(`pk_live_${Buffer.from("evil.com; script-src *$").toString("base64")}`)).toBeNull();
  });
});

describe("contentSecurityPolicy", () => {
  const prod = contentSecurityPolicy({ clerkHost: "clerk.fouzan.dev", dev: false });

  it("locks down framing, plugins, base and forms", () => {
    expect(prod).toContain("frame-ancestors 'none'");
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("base-uri 'self'");
    expect(prod).toContain("form-action 'self'");
    expect(prod).toContain("upgrade-insecure-requests");
  });

  it("allows scripts only from self and Clerk, with eval only in dev", () => {
    expect(prod).toMatch(/script-src 'self' 'unsafe-inline' https:\/\/clerk\.fouzan\.dev https:\/\/challenges\.cloudflare\.com;/);
    expect(prod).not.toContain("unsafe-eval");
    expect(prod).not.toMatch(/script-src[^;]* https:;/);
    const dev = contentSecurityPolicy({ clerkHost: "x.clerk.accounts.dev", dev: true });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("ws:");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });
});

describe("securityHeaders", () => {
  it("includes every header the checklist requires", () => {
    const names = securityHeaders({ clerkHost: null, dev: false }).map((h) => h.key);
    expect(names).toEqual(
      expect.arrayContaining([
        "Content-Security-Policy",
        "X-Frame-Options",
        "Strict-Transport-Security",
        "X-Content-Type-Options",
        "Referrer-Policy",
        "Permissions-Policy",
      ]),
    );
  });
});
