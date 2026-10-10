import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

// Deny by default. Only these routes skip the session + owner check (claude.md section 9).
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/.well-known/oauth-protected-resource(.*)",
  "/.well-known/oauth-authorization-server(.*)",
  "/api/mcp", // bearer auth handled by withMcpAuth in the route
  "/r/(.*)", // handler requires session OR valid signature
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  const { userId } = await auth.protect();
  if (userId !== env.OWNER_CLERK_USER_ID) {
    return new NextResponse("Not found", { status: 404 });
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
