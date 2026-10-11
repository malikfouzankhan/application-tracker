import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { archetypeValues, tierValues } from "@/db/enums";
import { jobAssessments, jobs } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { recordAudit } from "./audit";
import type { ServiceContext } from "./context";

export type AssessmentInput = {
  jobId: string;
  fitScore: number;
  tier: (typeof tierValues)[number];
  archetype: (typeof archetypeValues)[number];
  reasons: string;
  justifyNote?: string | null;
  risks?: string | null;
  recommended: boolean;
};

/**
 * submit_assessments: upsert on job_id (idempotent, latest judgment wins) and move jobs
 * from "new" to "assessed". Jobs already further along keep their stage.
 */
export async function submitAssessments(
  items: AssessmentInput[],
  ctx: ServiceContext,
): Promise<{ upserted: number; movedToAssessed: number }> {
  const jobIds = items.map((i) => i.jobId);
  if (new Set(jobIds).size !== jobIds.length) {
    throw new AppError("INVALID_INPUT", "Each job may appear only once per call");
  }

  return db.transaction(async (tx) => {
    const found = await tx.select({ id: jobs.id }).from(jobs).where(inArray(jobs.id, jobIds));
    if (found.length !== jobIds.length) {
      const known = new Set(found.map((r) => r.id));
      const missing = jobIds.filter((id) => !known.has(id));
      throw new AppError("NOT_FOUND", `Unknown job ids: ${missing.join(", ")}`);
    }

    await tx
      .insert(jobAssessments)
      .values(
        items.map((i) => ({
          jobId: i.jobId,
          fitScore: i.fitScore,
          tier: i.tier,
          archetype: i.archetype,
          reasons: i.reasons,
          justifyNote: i.justifyNote ?? null,
          risks: i.risks ?? null,
          recommended: i.recommended,
        })),
      )
      .onConflictDoUpdate({
        target: jobAssessments.jobId,
        set: {
          fitScore: sql`excluded.fit_score`,
          tier: sql`excluded.tier`,
          archetype: sql`excluded.archetype`,
          reasons: sql`excluded.reasons`,
          justifyNote: sql`excluded.justify_note`,
          risks: sql`excluded.risks`,
          recommended: sql`excluded.recommended`,
          updatedAt: new Date(),
        },
      });

    const moved = await tx
      .update(jobs)
      .set({ stage: "assessed" })
      .where(and(inArray(jobs.id, jobIds), eq(jobs.stage, "new")))
      .returning({ id: jobs.id });

    const tiers: Record<string, number> = {};
    for (const i of items) tiers[i.tier] = (tiers[i.tier] ?? 0) + 1;
    await recordAudit(tx, ctx, {
      action: "assessments.submit",
      targetType: "job_assessment",
      diff: { count: items.length, recommended: items.filter((i) => i.recommended).length, tiers },
    });

    return { upserted: items.length, movedToAssessed: moved.length };
  });
}
