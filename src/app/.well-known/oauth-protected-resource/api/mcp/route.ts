import { generateClerkProtectedResourceMetadata } from "@clerk/mcp-tools/server";
import { getPublicOrigin, metadataCorsOptionsRequestHandler } from "mcp-handler";
import { env } from "@/lib/env";

// RFC 9728 Protected Resource Metadata for the MCP endpoint at /api/mcp.
export function GET(req: Request) {
  const metadata = generateClerkProtectedResourceMetadata({
    publishableKey: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    resourceUrl: `${getPublicOrigin(req)}/api/mcp`,
  });
  return Response.json(metadata, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Cache-Control": "max-age=3600",
    },
  });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
