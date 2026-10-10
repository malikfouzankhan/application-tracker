import {
  authServerMetadataHandlerClerk,
  metadataCorsOptionsRequestHandler,
} from "@clerk/mcp-tools/next";

// RFC 8414: passes Clerk's metadata through unchanged (CIMD fields, S256, etc.). Do not hand-write.
export const GET = authServerMetadataHandlerClerk();
export const OPTIONS = metadataCorsOptionsRequestHandler();
