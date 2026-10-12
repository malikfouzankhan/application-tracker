import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: let a tunnel host (e.g. ngrok) reach dev resources like HMR. Set DEV_TUNNEL_HOST
  // in .env.local; kept out of the repo because the tunnel domain is personal.
  allowedDevOrigins: process.env.DEV_TUNNEL_HOST ? [process.env.DEV_TUNNEL_HOST] : [],
  cacheComponents: true,
  partialPrefetching: true,
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
