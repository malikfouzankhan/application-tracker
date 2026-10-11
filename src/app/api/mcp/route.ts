import { auth } from "@clerk/nextjs/server";
import { verifyClerkToken } from "@clerk/mcp-tools/next";
import { withMcpAuth } from "mcp-handler";
import { env } from "@/lib/env";
import { mcpHandler } from "@/mcp/server";

// RFC 9728: metadata for resource https://<host>/api/mcp lives at this path.
const RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource/api/mcp";

async function verifyToken(_req: Request, bearerToken?: string) {
  const clerkAuth = await auth({ acceptsToken: "oauth_token" });
  return verifyClerkToken(clerkAuth, bearerToken);
}

// Single-user app: a valid Clerk token is not enough, it must belong to the owner.
function ownerOnly(handler: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.auth?.extra?.userId !== env.OWNER_CLERK_USER_ID) {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    return handler(req);
  };
}

const handler = withMcpAuth(ownerOnly(mcpHandler), verifyToken, {
  required: true,
  resourceMetadataPath: RESOURCE_METADATA_PATH,
});

export { handler as GET, handler as POST };
