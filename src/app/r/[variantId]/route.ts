import { auth } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { isAppError } from "@/lib/errors";
import { verifyResumeLinkSignature } from "@/lib/sign";
import { getVariantPdf } from "@/services/resume-files";

// Resume PDF (claude.md section 9). Public in the proxy; this handler requires either the owner's
// Clerk session or a valid 24h signature. Anything else gets the same 404 as a missing variant.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notFound = () =>
  new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });

async function isAllowed(req: NextRequest, variantId: string): Promise<boolean> {
  const exp = req.nextUrl.searchParams.get("exp");
  const sig = req.nextUrl.searchParams.get("sig");
  if (sig && verifyResumeLinkSignature(env.PDF_SIGNING_SECRET, variantId, exp, sig, Math.floor(Date.now() / 1000))) {
    return true;
  }
  const { userId } = await auth();
  return userId === env.OWNER_CLERK_USER_ID;
}

export async function GET(req: NextRequest, ctx: RouteContext<"/r/[variantId]">) {
  const { variantId } = await ctx.params;
  if (!UUID_RE.test(variantId) || !(await isAllowed(req, variantId))) return notFound();

  try {
    const { pdf, filename } = await getVariantPdf(variantId);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") return notFound();
    console.error(`[r] render failed: ${error instanceof Error ? error.name : "unknown"}`);
    return new Response("Could not render resume", { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
