// Security headers for every response (claude.md section 10, "Web").
//
// CSP without nonces: the dashboard uses Partial Prerendering (Cache Components), which Next.js
// documents as incompatible with nonce-based CSP, so inline scripts are allowed for Next's own
// bootstrap. Everything else is locked down: scripts only from this origin and Clerk's Frontend
// API, no plugins, no foreign form targets, no framing. XSS defense rests on React escaping and on
// never rendering external HTML (job text is always plain text).

/** Clerk's Frontend API host, encoded in the publishable key (pk_test_/pk_live_ + base64 "host$"). */
export function clerkFrontendApiHost(publishableKey: string | undefined): string | null {
  const encoded = publishableKey?.match(/^pk_(?:test|live)_(.+)$/)?.[1];
  if (!encoded) return null;
  try {
    const host = Buffer.from(encoded, "base64").toString("utf8").replace(/\$$/, "");
    return /^[a-z0-9.-]+$/i.test(host) ? host : null;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy(options: { clerkHost: string | null; dev: boolean }): string {
  const clerk = options.clerkHost ? [`https://${options.clerkHost}`] : [];
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(options.dev ? ["'unsafe-eval'"] : []), ...clerk, "https://challenges.cloudflare.com"],
    "connect-src": [
      "'self'",
      ...clerk,
      "https://clerk-telemetry.com",
      "https://*.clerk-telemetry.com",
      "https://img.clerk.com",
      ...(options.dev ? ["ws:"] : []),
    ],
    "img-src": ["'self'", "data:", "blob:", "https://img.clerk.com"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "font-src": ["'self'", "data:"],
    "frame-src": ["https://challenges.cloudflare.com", ...clerk],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!options.dev) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

export function securityHeaders(options: { clerkHost: string | null; dev: boolean }): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), serial=(), browsing-topics=()",
    },
  ];
}
