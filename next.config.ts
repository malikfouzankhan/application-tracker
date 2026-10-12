import type { NextConfig } from "next";
import { clerkFrontendApiHost, securityHeaders } from "./src/lib/security-headers";

const headers = securityHeaders({
  clerkHost: clerkFrontendApiHost(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
  dev: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  // Dev only: let a tunnel host (e.g. ngrok) reach dev resources like HMR. Set DEV_TUNNEL_HOST
  // in .env.local; kept out of the repo because the tunnel domain is personal.
  allowedDevOrigins: process.env.DEV_TUNNEL_HOST ? [process.env.DEV_TUNNEL_HOST] : [],
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
