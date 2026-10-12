import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { resumeVariants } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { downloadPdf, uploadPdf } from "@/lib/storage";
import { renderVariantPdf, variantFilename } from "@/pdf/render";
import type { ServiceContext } from "./context";
import { approveResumeVariant, setVariantStoragePath } from "./resume";

/**
 * Dashboard "Approve": marks the variant approved (immutable), then renders it once and caches
 * the PDF in Storage. If caching fails the approval stands and /r renders on demand.
 */
export async function approveAndCacheVariant(variantId: string, ctx: ServiceContext): Promise<{ cached: boolean }> {
  await approveResumeVariant(variantId, ctx);
  try {
    const { pdf } = await renderVariantPdf(variantId);
    const path = `variants/${variantId}.pdf`;
    await uploadPdf(path, pdf);
    await setVariantStoragePath(variantId, path, ctx);
    return { cached: true };
  } catch (error) {
    // Error type only: query errors embed parameter values.
    console.error(`[resume] caching variant failed: ${error instanceof Error ? error.name : "unknown"}`);
    return { cached: false };
  }
}

/** The PDF for /r/[variantId]: the cached file for approved variants, a live render otherwise. */
export async function getVariantPdf(variantId: string): Promise<{ pdf: Buffer; filename: string; status: string }> {
  const [variant] = await db
    .select({ status: resumeVariants.status, storagePath: resumeVariants.storagePath })
    .from(resumeVariants)
    .where(eq(resumeVariants.id, variantId));
  if (!variant) throw new AppError("NOT_FOUND", "Resume variant not found");

  if (variant.status === "approved" && variant.storagePath) {
    try {
      const [pdf, filename] = await Promise.all([downloadPdf(variant.storagePath), variantFilename(variantId)]);
      return { pdf, filename, status: variant.status };
    } catch (error) {
      console.error(`[resume] cached PDF unavailable, rendering: ${error instanceof Error ? error.name : "unknown"}`);
    }
  }
  const { pdf, filename } = await renderVariantPdf(variantId);
  return { pdf, filename, status: variant.status };
}
